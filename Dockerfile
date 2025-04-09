FROM node:22 AS build

WORKDIR /usr/src/app

COPY . .

RUN yarn install --immutable

RUN yarn build

FROM node:22 AS production

WORKDIR /usr/src/app

COPY --from=build /usr/src/app/dist dist

EXPOSE 3000

ENTRYPOINT ["node", "dist/backend/index.cjs"]