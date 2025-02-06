Serlo editor as LTI tool

# Local dev setup

Requirements:

- Docker 24.0.0 or later
- Node LTS

1. Create a copy of `.env.template` as `.env`
2. (optional) Add secret values to `.env`
3. `yarn` to install dependencies
4. `yarn dev` to start the databases and the express backend & build the
   frontend

Now, the editor is running locally. On code changes the express server will
restart and the frontend will be rebuilt.

## Launch through Saltire

1. Go to https://saltire.lti.app/platform, sign in, navigate to "Advanced
   options" and upload file `saltire-platform_[TYPE].config` of the
   [`saltire-configs/`](./saltire-configs) directory. `TYPE=LTIDeepLinking`
   shows flow of creating a new Serlo Editor element.
   `TYPE=LTIResourceLink_Instructor` shows flow of opening an existing Serlo
   Editor element as Instructor (editable). `TYPE=LTIResourceLink_Learner` shows
   flow of opening an existing Serlo Editor element as Learner (non-editable).
2. Click "Connect"

## Launch through mocked services

1. `yarn dev-mocks` to start the edu-sharing/itslearning mocks
2. Open `http://localhost:8100` (edu-sharing) or `http://localhost:8101`
   (itslearning)

# Technical details

LTI launch is handled by [ltijs](https://github.com/Cvmcosta/ltijs/).

ltijs sets up an express server.

React frontend is bundled with Vite and then provided by the `/app` route in
express.

On a successful LTI launch the server returns a signed `accessToken` jwt that
the client can then later use to authenticate saving content.

# Type Checking of Environment Variables

If you need to add a new mandatory environment variable in the `.env` file, add
a type checking at `src/utils/config.ts`.

# Management of .env files of deployment environments

The easiest way to update the `.env` of the development, staging and production
environments is to do it directly in them.

1. Ssh into the environment, v.g. `ssh edtrdev@editor.serlo.dev` if you need to
   change the development environment.
2. `cd ~/serlo-editor-as-lti-tool`
3. Modify the `.env` file, testing it accordingly if possible. Remember to
   restart the serlo-app service `supervisorctl restart serlo-app` in order that
   the changes take place.
4. Upload the file to the bucket v.g. `s3cmd put .env s3://edtr-env/$USER/.env`.
   That way you will not only backup it but also guarantee that in the next
   deployment the file in the bucket will be used.

If you prefer or need to do the changes in your local machine, you have two
options:

A. UI: If you have the permissions, you can login into IONOS and manage the
`.env` files there using the UI. You need to download, modify and upload them.

B. CLI:

1. Ask the admin to include you into the IONOS contract and update to policy of
   the corresponding bucket. Alternatively, you can use the credentials of the
   dev or admin user.
2. Install a S3 client CLI (we recommend `s3cmd`,
   https://docs.ionos.com/cloud/storage-and-backup/s3-object-storage/s3-tools/s3cmd)
   and configure it accordingly. For access and secret keys go to
   https://dcd.ionos.com/latest/#/key-management. Some other info:

   ```
   Default Region: eu-central-3
   S3 Endpoint: s3.eu-central-3.ionoscloud.com
   DNS-style: s3.eu-central-3.ionoscloud.com
   ```

3. Download the file you want to modify, v.g.
   `s3cmd get s3://edtr-env/edtrdev/.env .env.edtrdev`, change it and upload it
   v.g. `s3cmd put .env.edtrdev s3://edtr-env/edtrdev/.env`.

# MariaDB Dump

If it is important for development to have something already existent in the
MariaDB, you can first add the content, and then dump it with and commit the
result in `docker-entrypoint-initdb.d`.

```console
$ yarn mariadb-reset # that way you are sure the database will be in the initial state in the next step
$ yarn mariadb # Go to the database and change whatever you need. Alternatively you can write a migration script.
$ yarn mariadb-dump # That way you don't need to change ./docker-entrypoint-initdb.d/001-init.sql by hand
$ git add ./docker-entrypoint-initdb.d
$ git commit
$ git push
```

# Embed Serlo editor in iframe

Iframes provide security to the host page but can limit access to required
functionality (especially for cross-origin embedding). Please use the following
settings in iframe attributes `sandbox` and `allow`.

## sandbox

If you have/want attribute `sandbox` use:

```html
<iframe
  sandbox="
    allow-downloads
    allow-forms
    allow-modals
    allow-popups
    allow-popups-to-escape-sandbox
    allow-presentation
    allow-same-origin
    allow-scripts
    allow-storage-access-by-user-activation
  "
  src="..."
  ...
></iframe>
```

If you don't have/want attribute `sandbox` it can also be missing. But never an
empty string.

```html
<!-- Do not use -->
<iframe sandbox="" src="..."></iframe>
```

## allow

If you have/want attribute `allow` use

```html
<iframe
  allow=" 
    clipboard-read https://editor.serlo.org https://staging.editor.serlo.org https://dev.editor.serlo.org https://editor.serlo-staging.dev; 
    clipboard-write https://editor.serlo.org https://staging.editor.serlo.org https://dev.editor.serlo.org https://editor.serlo-staging.dev; 
    fullscreen https://editor.serlo.org https://staging.editor.serlo.org https://dev.editor.serlo.org https://editor.serlo-staging.dev; 
    autoplay https://editor.serlo.org https://staging.editor.serlo.org https://dev.editor.serlo.org https://editor.serlo-staging.dev 
  "
  src="..."
  ...
></iframe>
```

or

```html
<!-- Allows all origins access -->
<iframe
  ...
  allow="
   clipboard-read *;
   clipboard-write *;
   fullscreen *;
   autoplay *
  "
  src="..."
></iframe>
```

If you don't have/want attribute `allow` it can also be missing. But never an
empty string.

```html
<!-- Do not use -->
<iframe allow="" src="..."></iframe>
```
