#!/bin/bash

set -e

# Check if .env file exists in the current directory
if [ ! -f .env ]; then
  echo "Error: Please create an .env file based on one of the templates you find in this repo and add missing secret values."
  exit 1
fi

# Set Node.js version
if ! $(uberspace tools version show node | grep -q '20'); then
  uberspace tools version use node 20
fi

# Remove default X-Frame-Options header to allow embedding in iframe
# TODO: X-Frame-Options is deprecated anyway. Maybe restrict embedding only on allowed domains using new headers? See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options instead
uberspace web header suppress / X-Frame-Options

echo 'Configure IONOS S3 Client for Management'
s3cmd --configure

echo 'Downloading the .env file'
if ! s3cmd cp s3://edtr-env/${USER}/.env .; then
  echo 'Error: File not found or download failed!'
  echo 'Set the .env file in the bucket first'
  exit 1
fi

# Pull env into current shell
source .env

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

  echo 'Available buckets:'
  s3cmd ls
  echo 'Create bucket serlo-test-database-backup manually if it does not appear here.'
fi
