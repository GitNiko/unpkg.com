const url = require("url");
const https = require("https");
const http = require("http")

const serverConfig = require("../serverConfig");
const bufferStream = require("./bufferStream");
const agent = require("./registryAgent");
const logging = require("./logging");

function parseJSON(res) {
  return bufferStream(res).then(JSON.parse);
}

function fetchNpmPackageInfo(packageName) {
  return new Promise((resolve, reject) => {
    const encodedPackageName =
      packageName.charAt(0) === "@"
        ? `@${encodeURIComponent(packageName.substring(1))}`
        : encodeURIComponent(packageName);

    const infoURL = `${serverConfig.registryURL}/${encodedPackageName}`;

    logging.debug("Fetching package info for %s from %s", packageName, infoURL);

    const { hostname, pathname, protocol, port} = url.parse(infoURL);
    const options = {
      agent: agent,
      hostname: hostname,
      path: pathname,
      headers: {
        Accept: "application/json"
      }
    };
    let request = https
    if(protocol !== 'https:') {
      request = http
      delete options.agent
      options.port = port
    }
    request
      .get(options, res => {
        if (res.statusCode === 200) {
          resolve(parseJSON(res));
        } else if (res.statusCode === 404) {
          resolve(null);
        } else {
          bufferStream(res).then(data => {
            const content = data.toString("utf-8");
            const error = new Error(
              `Failed to fetch info for ${packageName}\nstatus: ${
                res.statusCode
              }\ndata: ${content}`
            );

            reject(error);
          });
        }
      })
      .on("error", reject);
  });
}

module.exports = fetchNpmPackageInfo;
