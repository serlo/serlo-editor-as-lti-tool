Serlo editor as LTI tool

Allows integrating the Serlo Editor into various learning management systems
like Moodle, itslearning, edu-sharing, ...

# Local dev setup

Requirements:

- Docker 24.0.0 or later
- Node 20.14.0 or later

1. `yarn` to install dependencies
2. Create a copy of `.env.template` as `.env`
3. `yarn generate-secret` to generate a `LTIJS_KEY` in .env
4. Add missing secret values in `.env`
5. `yarn dev` to start the LTI tool

Now, the LTI tool is running locally. On code changes the express server will
restart and the frontend will be rebuilt.

6. Launch the LTI tool using either Saltire or the LMS mocks

## Launch through Saltire

1. Go to https://saltire.lti.app/platform, sign in, navigate to "Advanced
   options" and upload file `saltire-platform_[TYPE].config` of the
   [`saltire-configs/`](./saltire-configs) directory. `TYPE=LTIDeepLinking`
   shows flow of creating a new Serlo Editor element.
   `TYPE=LTIResourceLink_Instructor` shows flow of opening an existing Serlo
   Editor element as Instructor (editable). `TYPE=LTIResourceLink_Learner` shows
   flow of opening an existing Serlo Editor element as Learner (non-editable).
2. Click "Connect"

## Launch through LMS mocks

1. `yarn dev-mocks` to start the edu-sharing/itslearning mocks
2. Open `http://localhost:8100` (edu-sharing) or `http://localhost:8101`
   (itslearning)

# Project structure

`src/backend` contains the Express server built on top of
[ltijs](https://github.com/Cvmcosta/ltijs/)

`src/frontend` contains the React frontend bundled with Vite and provided in
express through the `/app` route

`mocks` contains mocks for edu-sharing and itslearning that can launch the lti
tool in local development

`e2e` contains end-to-end tests

`uberspace` contains scripts and configuration files for setting up a deployment
on Uberspace

# Type Checking of Environment Variables

If you need to add a new mandatory environment variable in the `.env` file, add
it to `src/utils/config.ts`.

# Using Docker to Deploy

You may want to deploy using docker. First, during development, you can locally
test it in the following command.

```console
$ yarn dev-image
```

Now you can open the browser at localhost:8100 or localhost:8101.

To publish a new docker image, just change the version at `package.json` and
push to branch `staging`.

# .env files in deployments

The .env files on Uberspace contain secrets and are stored separately in an S3
bucket.

Making changes:

1. SSH into the environment, v.g. `ssh edtrdev@editor.serlo.dev` if you need to
   change the development environment.
2. `cd ~/serlo-editor-as-lti-tool`
3. Modify the `.env` file.
4. Restart the serlo-app service `supervisorctl restart serlo-app` so that the
   new .env values are used.
5. Test if everything works
6. Upload the file to the bucket v.g. `s3cmd put .env s3://edtr-env/$USER/.env`.

If you prefer or need to do the changes in your local machine, you have two
options:

A. UI: If you have the permissions, you can login into IONOS and manage the
`.env` files there using the UI. You need to download, modify and upload them.

B. CLI:

1. Ask an admin to include you into the IONOS contract and update to policy of
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
