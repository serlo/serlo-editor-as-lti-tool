Prototype: Serlo editor as LTI tool

# Local dev setup

Requirements:

- Docker & Docker Compose

1. Create local `.env` file and add required env values
2. `yarn` to install dependencies
3. `yarn dev` to start docker containers (hot reload)

Now, the editor is running locally.

## Saltire

1. Go to https://saltire.lti.app/platform, sign in, navigate to "Advanced
   options" and upload file `saltire-platform_[TYPE].config` of the
   [`saltire-configs/`](./saltire-configs) directory. `TYPE=LTIDeepLinking`
   shows flow of creating a new Serlo Editor element.
   `TYPE=LTIResourceLink_Instructor` shows flow of opening an existing Serlo
   Editor element as Instructor (editable). `TYPE=LTIResourceLink_Learner` shows
   flow of opening an existing Serlo Editor element as Learner (non-editable).
2. Click "Connect"

The editor should open in a new tab.

## Edu-sharing mock

1. `yarn dev:edusharing` to start the edu-sharing mock
2. Open `http://localhost:8100`

# Technical details

LTI launch is handled by [ltijs](https://github.com/Cvmcosta/ltijs/).

ltijs sets up an express server.

React frontend is bundled with Vite and then provided by the `/app` route in
express.

On a successful LTI launch the server returns a signed `accessToken` jwt that
the client can then later use to authenticate saving content.
