const url = require("url");
const https = require("https");
const http = require("http")
const lpath = require('path')
const fs = require('fs')
const fse = require('fs-extra')
const gunzip = require("gunzip-maybe");
const tar = require("tar-stream");
const tarfs = require('tar-fs')
const bufferStream = require("./bufferStream");
const agent = require("./registryAgent");
const logging = require("./logging");

// /app/.cache
const cacheDir = process.env.CACHE_DIR ? process.env.CACHE_DIR : `/.cache`

function fetchNpmPackage(packageConfig) {
  return new Promise((resolve, reject) => {
    const tarballURL = packageConfig.dist.tarball;
    const dir = lpath.join(process.cwd(), `${cacheDir}/${packageConfig.name}`)
    const path = `${dir}/${packageConfig.name}-${packageConfig.version}`

    logging.debug(
      "Fetching package for %s from %s",
      packageConfig.name,
      tarballURL
    );

    const { hostname, pathname, protocol, port } = url.parse(tarballURL);
    const options = {
      agent: agent,
      hostname: hostname,
      path: pathname
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
        resolve(res.pipe(gunzip()).pipe(tar.extract()));
        try {
          fse.ensureDirSync(dir)
          res.pipe(gunzip()).pipe(tarfs.extract(path))
        } catch(e) {
          console.error(e)
          fse.rmdirSync(dir)
        }
      } else {
        bufferStream(res).then(data => {
          const spec = `${packageConfig.name}@${packageConfig.version}`;
          const content = data.toString("utf-8");
          const error = new Error(
            `Failed to fetch tarball for ${spec}\nstatus: ${
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

module.exports = fetchNpmPackage;
