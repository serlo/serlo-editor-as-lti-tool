Prototype: Serlo editor as LTI tool

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

## Launch through edu-sharing mock

1. `yarn dev-edusharing` to start the edu-sharing mock
2. Open `http://localhost:8100`

# Technical details

LTI launch is handled by [ltijs](https://github.com/Cvmcosta/ltijs/).

ltijs sets up an express server.

React frontend is bundled with Vite and then provided by the `/app` route in
express.

On a successful LTI launch the server returns a signed `accessToken` jwt that
the client can then later use to authenticate saving content.

# Management of Env Vars of the Deployments

To use CLI to update any environment variable of the development, staging and
production environments, follow these steps:

1. Ask the admin to include you into the IONOS contract and update to policy of
   the corresponding bucket. Alternatively, you can use the credentials of the
   dev or admin user.
2. Install a s3 client CLI (we recommend `s3cmd`) and configure it accordingly.
3. Download the file, update it and upload it.

Alternatively, if you have the permissions, you can login into IONOS and manage
there using the UI.
