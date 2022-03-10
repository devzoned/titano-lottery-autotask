# Titano Lottery Defender Autotask

## Setup

The `webpack.config.js` file instructs Webpack to output 3 files to `dist/start.js`, `dist/close.js`, `dist/draw.js` based on the input files from `src/`. All dependencies tagged as `external` will not be included in the bundle, since they are available in the Autotask environment - other dependencies in the example, will be embedded in it.

Run `yarn build` to have Webpack generate the files in `dist/`, and copy them into your Autotask.

## Running Locally

You can run the scripts locally, instead of in an Autotask, via a Defender Relayer. Create a Defender Relayer on mainnet, write down the API key and secret, and create a `.env` file in this folder with the following content:

```
API_KEY=yourapikey
API_SECRET=yourapisecret
```

Then run `yarn start` to run your script locally, connecting to your Relay via API.
