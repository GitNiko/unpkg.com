const path = require("path");
const semver = require("semver");

const getNpmPackageInfo = require("../utils/getNpmPackageInfo");
const fetchNpmPackage = require("../utils/fetchNpmPackage");
const getIntegrity = require("../utils/getIntegrity");
const getContentType = require("../utils/getContentType");

const ExternalPackageName = "@shein/webpack-external-map";

function stripLeadingSegment(name) {
  return name.replace(/^[^/]+\/?/, "");
}

function searchEntries(tarballStream, entryName, wantsIndex) {
  return new Promise((resolve, reject) => {
    const entries = {};
    let foundEntry = null;

    if (entryName === "") {
      foundEntry = entries[""] = { name: "", type: "directory" };
    }

    tarballStream
      .on("error", reject)
      .on("finish", () => resolve({ entries, foundEntry }))
      .on("entry", (header, stream, next) => {
        const entry = {
          // Most packages have header names that look like `package/index.js`
          // so we shorten that to just `index.js` here. A few packages use a
          // prefix other than `package/`. e.g. the firebase package uses the
          // `firebase_npm/` prefix. So we just strip the first dir name.
          name: stripLeadingSegment(header.name),
          type: header.type
        };

        // We are only interested in files that match the entryName.
        if (entry.type !== "file" || entry.name.indexOf(entryName) !== 0) {
          stream.resume();
          stream.on("end", next);
          return;
        }

        entries[entry.name] = entry;

        // Dynamically create "directory" entries for all directories
        // that are in this file's path. Some tarballs omit these entries
        // for some reason, so this is the brute force method.
        let dirname = path.dirname(entry.name);
        while (dirname !== ".") {
          const directoryEntry = { name: dirname, type: "directory" };

          if (!entries[dirname]) {
            entries[dirname] = directoryEntry;

            if (directoryEntry.name === entryName) {
              foundEntry = directoryEntry;
            }
          }

          dirname = path.dirname(dirname);
        }

        // Set the foundEntry variable if this entry name
        // matches exactly or if it's an index.html file
        // and the client wants HTML.
        if (
          entry.name === entryName ||
          // Allow accessing e.g. `/index.js` or `/index.json` using
          // `/index` for compatibility with CommonJS
          (!wantsIndex && entry.name === `${entryName}.js`) ||
          (!wantsIndex && entry.name === `${entryName}.json`)
        ) {
          foundEntry = entry;
        }

        const chunks = [];

        stream
          .on("data", chunk => chunks.push(chunk))
          .on("end", () => {
            const content = Buffer.concat(chunks);

            // Set some extra properties for files that we will
            // need to serve them and for ?meta listings.
            entry.contentType = getContentType(entry.name);
            entry.integrity = getIntegrity(content);
            entry.lastModified = header.mtime.toUTCString();
            entry.size = content.length;

            // Set the content only for the foundEntry and
            // discard the buffer for all others.
            if (entry === foundEntry) {
              entry.content = content;
            }

            next();
          });
      });
  });
}

function getExternalMap() {
  return getNpmPackageInfo(ExternalPackageName)
    .then(packageInfo => {
      const packageConfig =
        packageInfo.versions[packageInfo["dist-tags"].latest];
      return fetchNpmPackage(packageConfig);
    })
    .then(tarballStream => {
      const entryName = "storage/external.json";
      return searchEntries(tarballStream, entryName, false).then(
        ({ entries, foundEntry }) => {
          if (!foundEntry) {
            throw new Error(`${entryName} not found`);
          }
          return foundEntry.content;
        }
      );
    }).then(buffer => JSON.parse(buffer))
}

function getSource(externalMap, pkgName, version, sourceName, solutionName) {
  const type = path.extname(sourceName).split(".")[1];
  const range = Object.keys(externalMap[pkgName]).filter(v =>
    semver.satisfies(version, v)
  )[0];
  const index = Object.values(externalMap[pkgName][range][type])
    .filter(v => {
      return v.find(s => s === sourceName) !== undefined;
    })[0]
    .findIndex(s => s === sourceName);
  return externalMap[pkgName][range][type][solutionName][index];
}

function switchExternal(req, res, next) {
  if (req.query.switch) {
    getExternalMap()
      .then(m => {
        const pkgName = req.packageName;
        const version = req.packageVersion;
        const solutionName = req.query.switch;
        const sourceName = req.filename.slice(1);
        const switchSource = getSource(
          m,
          pkgName,
          version,
          sourceName,
          solutionName
        );
        req.filename = switchSource;
        next();
      })
      .catch(err => {
        console.error(err);
        next();
      });
  } else {
    next();
  }
}

module.exports = switchExternal;
