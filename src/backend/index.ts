import { Provider as ltijs } from "ltijs";
import "dotenv/config";
import path from "node:path";
import * as t from "io-ts";
import * as jwt from "jsonwebtoken";

// Requires Node.js 20.11 or higher
const __dirname = import.meta.dirname;

const ltijsKey = process.env.LTIJS_KEY;
if (!ltijsKey) {
  throw new Error(
    "Missing LTIJS_KEY. Please ensure there is an .env file and it contains a LTIJS_KEY."
  );
}
const mongodbConnectionUri = process.env.MONGODB_CONNECTION_URI;
if (!mongodbConnectionUri) {
  throw new Error(
    "Missing MONGODB_CONNECTION_URI. Please ensure there is an .env file and it contains a MONGODB_CONNECTION_URI."
  );
}

export const LtiCustomType = t.type({
  editor_mode: t.union([t.literal("read"), t.literal("write")]),
  entity_id: t.string,
});

// Setup
ltijs.setup(
  ltijsKey,
  {
    url: mongodbConnectionUri,
  },
  {
    appUrl: "/lti-success",
    staticPath: path.join(__dirname, "./../../dist"), // Path to static files
    cookies: {
      secure: false, // Set secure to true if the testing platform is in a different domain and https is being used
      sameSite: "", // Set sameSite to 'None' if the testing platform is in a different domain and https is being used
    },
  }
);

// Opens Serlo editor
ltijs.app.get("/app", async (_, res) => {
  return res.sendFile(path.join(__dirname, "../../dist/index.html"));
});

// Endpoint to save content
ltijs.app.put("/mutate", async (req, res) => {
  const accessToken = req.body.accessToken;
  if (typeof accessToken !== "string") {
    return res.send("Missing or invalid access token");
  }

  // @ts-expect-error For some reason I need `default` here
  const decodedAccessToken = jwt.default.verify(accessToken, ltijsKey);

  if (decodedAccessToken.accessRight !== "write") {
    return res.send("Access token grants no right to modify content");
  }

  // TODO: Modify entity with decodedAccessToken.entityId in database

  console.log(
    `Entity ${
      decodedAccessToken.entityId
    } modified in database. New state:\n${JSON.stringify(req.body.editorState)}`
  );

  return res.send("Success");
});

// ltijs.app.get("/entity/:id", (req, res) => {
//   const entityId = req.params.id;
//   res.send(req.params);
// });

// Successful LTI launch
ltijs.onConnect((_, __, res) => {
  // This might need to change depending on what type the platform sends us
  const custom: unknown = res.locals.context?.custom;
  if (!LtiCustomType.is(custom)) {
    return res.send("Error");
  }
  const editorMode = custom.editor_mode;
  const entityId = custom.entity_id;

  // Generate access token and send to client
  // TODO: Maybe use registered jwt names
  // @ts-expect-error For some reason I need `default` here
  const accessToken = jwt.default.sign(
    { entityId, accessRight: editorMode },
    ltijsKey
  );

  return ltijs.redirect(res, `/app?accessToken=${accessToken}`);
}, {});

// Successful LTI deep linking launch
ltijs.onDeepLinking((_, __, res) => {
  // TODO: create new entity in database and get its ID
  const entityId = 123456;

  // Generate access token (authorizing write access) and send to client
  // TODO: Maybe use registered jwt names
  // @ts-expect-error For some reason I need `default` here
  const accessToken = jwt.default.sign(
    { entityId, accessRight: "write" },
    ltijsKey // Reuse the symmetric HS256 key used by ltijs to sign ltik and database entries
  );

  return ltijs.redirect(res, `/app?accessToken=${accessToken}?deeplink=true`, {
    isNewResource: true, // Tell ltijs that this is a new resource so it can update some stuff in the database
  });
});

ltijs.app.post("/finish-deeplink", async (req, res) => {
  const accessToken = req.body.accessToken;
  if (typeof accessToken !== "string") {
    return res.send("Missing or invalid access token");
  }

  // @ts-expect-error For some reason I need `default` here
  const decodedAccessToken = jwt.default.verify(accessToken, ltijsKey);

  // This might need to change depending on what type the platform accepts
  const items = [
    {
      type: "ltiResourceLink",
      url: `http://localhost:3000/entity/${decodedAccessToken.entityId}`,
      title: `Serlo Editor Content ${decodedAccessToken.entityId}`,
    },
  ];

  // Creates the deep linking request form
  const form = await ltijs.DeepLinking.createDeepLinkingForm(
    res.locals.token,
    items,
    { message: "Deep linking success" }
  );

  return res.send(form);
});

// Setup function
const setup = async () => {
  await ltijs.deploy();

  /**
   * Register platform
   */
  await ltijs.registerPlatform({
    url: "https://saltire.lti.app/platform",
    name: "saltire.lti.app",
    clientId: "saltire.lti.app",
    authenticationEndpoint: "https://saltire.lti.app/platform/auth",
    accesstokenEndpoint:
      "https://saltire.lti.app/platform/token/sc24671cd70c6e45554e6c405a2f5d966",
    authConfig: {
      method: "JWK_SET",
      key: "https://saltire.lti.app/platform/jwks/sc24671cd70c6e45554e6c405a2f5d966",
    },
  });
};

setup();
