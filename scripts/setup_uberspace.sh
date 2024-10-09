#!/bin/bash

set -e

# Set Node.js version
if ! $(uberspace tools version show node | grep -q '20'); then
  uberspace tools version use node 20
fi

# Remove default X-Frame-Options header to allow embedding in iframe
# TODO: X-Frame-Options is deprecated anyway. Maybe restrict embedding only on allowed domains using new headers? See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options instead
uberspace web header suppress / X-Frame-Options

# Create MySQL table
mysql -e 'USE '$USER'; CREATE TABLE IF NOT EXISTS `lti_entity` ( `id` bigint NOT NULL AUTO_INCREMENT, `resource_link_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci NOT NULL, `custom_claim_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci DEFAULT NULL,`edusharing_node_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, `content` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci NOT NULL, `id_token_on_creation` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci NOT NULL, PRIMARY KEY (`id`), KEY `idx_lti_entity_custom_claim_id` (`custom_claim_id`) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;'
echo 'MySQL table created successfully (or existed already)'

# Generate mongodb password
if ! $(grep MONGODB_PASSWORD ~/.bashrc); then
  export MONGODB_PASSWORD=$(pwgen 32 1)
  echo "export MONGODB_PASSWORD=$MONGODB_PASSWORD" >> ~/.bashrc
fi

# Pull env into current shell
source ~/.bashrc

# Set up MongoDB
if ! $(uberspace tools version show mongodb | grep -q '6.0'); then
  uberspace tools version use mongodb 6.0
  echo 'MongoDB version set to 6.0. Waiting a few seconds until it runs.'
fi
mkdir -p ~/mongodb
cp ./uberspace/mongodb/mongodb.ini ~/etc/services.d/
echo $(supervisorctl reread)
echo $(supervisorctl update)
sleep 2
if ! $(supervisorctl status | grep -q 'RUNNING'); then
  echo 'MongoDB status is not RUNNING'
  exit 1
fi
cp ./uberspace/mongodb/.mongoshrc.js ~/
cp ./uberspace/mongodb/setup.js ~/mongodb/
mongosh admin ~/mongodb/setup.js
echo 'MongoDB set up successfully'

# Set environment variables
cp .env-template .env
mysql_pw=$(grep -oP -m 1 "^password=(.*)" ~/.my.cnf | cut -d '=' -f 2-)
echo "MYSQL_URI=mysql://${USER}:${mysql_pw}@localhost:3306/${USER}" >> .env
echo "MONGODB_URI=mongodb://${USER}_mongoroot:${MONGODB_PASSWORD}@127.0.0.1:27017/" >> .env
echo 'Updated environment variables'

# Install dependencies
yarn
echo 'Installed dependencies using Yarn'

# Build frontend and backend
yarn build
echo 'Built the frontend and the backend apps using Yarn'

# Run the backend as an Uberspace service
cp ./uberspace/app.ini ~/etc/services.d/
supervisorctl reread
supervisorctl update
if $(supervisorctl status | grep -q "serlo-app.*RUNNING"); then
  supervisorctl restart serlo-app
  echo 'Restarted the serlo-app Uberspace service, as it already existed'
else
  supervisorctl start serlo-app
  echo 'Started the serlo-app Uberspace service for running the backend app'
fi

# Open the LTI backend to the internet
uberspace web backend set / --http --port 3000
if ! $(uberspace web backend list | grep -q 'http:3000 => OK, listening'); then
  echo 'Uberspace web backend is not listening'
  exit 2
fi
echo 'Backend app opened to the internet'

# Only on 'production' environment
if [ "$USER" = "edtr" ]; then
  # IMPORTANT: This completely overwrites existing cronjob entries!
  crontab ~/serlo-editor-as-lti-tool/uberspace/backup_cron
  echo 'Added cronjob for database backups'
  
  echo 'Configuring IONOS S3 for database backups'
  s3cmd --configure
  
  echo 'Available buckets:'
  s3cmd ls
  echo 'Create bucket serlo-test-database-backup manually if it does not appear here.'
fi
