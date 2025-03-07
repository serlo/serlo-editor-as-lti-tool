set -e

timestamp="$(date '+%Y-%m-%d-%H-%M-%S')"
file="/home/${USER}/$timestamp.sql"

# Database name is ${USER}
mysqldump ${USER} > $file

s3cmd put $file "s3://editor-database-backup-$USER"

rm $file

echo 'Successfully backed up database on IONOS'
