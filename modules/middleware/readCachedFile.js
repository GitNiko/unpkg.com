const lpath = require('path')
const fs = require('fs')
const etag = require("etag");

const getContentType = require("../utils/getContentType");

const leadingSlash = /^\//;
const trailingSlash = /\/$/;

const cacheDir = process.env.CACHE_DIR ? process.env.CACHE_DIR : '/.cache'

function readCachedFile(req, res, next) {
  if(req.query.switch) {
    next()
    return
  }

  const file = req.filename.replace(trailingSlash, '').replace(leadingSlash, '')
  const packageName = req.packageConfig.name
  const version = req.packageConfig.version
  const dir = lpath.join(process.cwd(), `${cacheDir}/${packageName}`)
  const path = `${dir}/${packageName}-${version}/package/${file}`

  fs.open(path, 'r', (err, fd) => {
    if(err) {
      next()
    } else {
      console.log(`read cached file: ${path}`)
      fs.fstat(fd, (err, stats) => {
        if(err || stats.isDirectory()) {
          next()
        } else {
          const rs = fs.createReadStream(path, {fd})
          res.set({
            "Content-Length": stats.size,
            "Content-Type": getContentType(file),
            "Cache-Control": "public, max-age=31536000, immutable",
            "Last-Modified": stats.mtime.toUTCString(),
            ETag: etag(stats)
          })
          rs.pipe(res)

          rs.on('finish', () => {
            fs.close(fd)
          })
          rs.on('error', (err) => {
            console.error(err)
            fs.close(fd)
          })
        }
      })
    }
  })
}

module.exports = readCachedFile