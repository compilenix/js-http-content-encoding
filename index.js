module.exports.getSupportedContentEncodings = getSupportedContentEncodings
module.exports.getSupportedContentEncodingHeaderRequest = getSupportedContentEncodingHeaderRequest
module.exports.getSupportedContentEncodingHeaderResponse = getSupportedContentEncodingHeaderResponse
module.exports.tryDecodeHttpResponse = tryDecodeHttpResponse
module.exports.tryDecodeBuffer = tryDecodeBuffer

const http = require('http') // eslint-disable-line no-unused-vars
const zlib = require('zlib')
const { Readable } = require('stream')

function getSupportedContentEncodings () {
  return ['gzip', 'deflate']
}

/**
 * @param {boolean} splitIntoSeperateheaders
 * @returns {{ name: string, value: string | string[] }}
 */
function getSupportedContentEncodingHeaderRequest (splitIntoSeperateheaders = false) {
  let value = splitIntoSeperateheaders ? getSupportedContentEncodings() : getSupportedContentEncodings().toString()
  return { name: 'Accept-Encoding', value: value }
}

/**
 * @param {boolean} splitIntoSeperateheaders
 * @returns {{ name: string, value: string | string[] }}
 */
function getSupportedContentEncodingHeaderResponse (splitIntoSeperateheaders = false) {
  let value = splitIntoSeperateheaders ? getSupportedContentEncodings() : getSupportedContentEncodings().toString()
  return { name: 'Content-Encoding', value: value }
}

/**
 * Try to uncompress a buffer. On error you get the unchanged input back.
 * @param {string} compressionAlg I.e. 'gzip' or 'deflate'
 * @param {Buffer} buffer
 * @see getSupportedContentEncodings()
 * @returns {Promise<{hasBeenDecoded: boolean, buffer: Buffer}>}
 */
async function tryDecodeBuffer (compressionAlg, buffer) {
  return new Promise((resolve, reject) => {
    compressionAlg = compressionAlg.toLowerCase().trim()
    const result = { hasBeenDecoded: false, buffer: buffer }
    if (!getSupportedContentEncodings().some(x => x === compressionAlg)) return resolve(result)

    /** @type {zlib.Gunzip | zlib.Inflate} */
    let decompresor
    let readable = new Readable()
    readable._read = () => {}
    const zlibOptions = {
      flush: zlib.Z_SYNC_FLUSH,
      finishFlush: zlib.Z_SYNC_FLUSH
    }

    if (compressionAlg === 'gzip') {
      decompresor = zlib.createGunzip(zlibOptions)
    } else if (compressionAlg === 'deflate') {
      decompresor = zlib.createInflateRaw(zlibOptions)
    }
    if (decompresor === undefined) return reject(new Error(`Not implemented but marked as supported compressionAlg: "${compressionAlg}"`))
    readable.pipe(decompresor)
    readable.push(buffer)
    readable.push(null)

    let bufferOut = Buffer.alloc(0)
    decompresor.on('data', data => {
      bufferOut = Buffer.concat([bufferOut, Buffer.from(data)])
    })

    decompresor.on('end', () => {
      resolve({ hasBeenDecoded: true, buffer: bufferOut })
    })

    decompresor.on('error', e => {
      resolve(result)
    })
  })
}

/**
 * Try to detect and uncompress a http response body. On error you get the unchanged input back.
 *
 * Remember to NOT set the response object into 'utf8' encoding mode using res.setEncoding('utf8') !!
 * @param {http.IncomingMessage} res
 * @param {Buffer} body
 * @returns {Promise<{hasBeenDecoded: boolean, body: Buffer}>}
 */
async function tryDecodeHttpResponse (res, body) {
  return new Promise(async (resolve, reject) => {
    const result = { hasBeenDecoded: false, body: body }
    const contentEncodingHeader = res.headers['content-encoding'].trim()
    if (!contentEncodingHeader || contentEncodingHeader.length === 0) return resolve(result)

    // typical one-round-compression
    if (/^(gzip|deflate)$/i.test(contentEncodingHeader)) {
      let decoded = await tryDecodeBuffer(contentEncodingHeader, body)
      return resolve({ hasBeenDecoded: decoded.hasBeenDecoded, body: decoded.buffer })
    }

    // "deflate , "

    // got multiple compressions
    let tmpResult = { hasBeenDecoded: false, buffer: result.body }
    let hasBeenDecoded = false
    if (contentEncodingHeader.indexOf(',') >= 0) {
      const compressions = contentEncodingHeader.split(',').reverse()
      if (compressions.length === 0) return resolve(result)

      for (let index = 0; index < compressions.length; index++) {
        const compression = compressions[index]
        tmpResult = await tryDecodeBuffer(compression, tmpResult.buffer)
        if (tmpResult.hasBeenDecoded) hasBeenDecoded = true
      }
    }
    if (hasBeenDecoded) return resolve({ hasBeenDecoded: hasBeenDecoded, body: tmpResult.buffer })

    return resolve(result)
  })
}
