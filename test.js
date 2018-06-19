(async () => {
  console.log('running tests')
  const http = require('http') // eslint-disable-line no-unused-vars
  const fs = require('fs-extra')
  const contentEncoding = require('./index.js')

  let hasError = false

  /**
   * @param {string} name
   * @param {{ hasBeenDecoded: boolean; body: Buffer; }} result
   * @param {number} length
   */
  function test (name, result, length) {
    if (!result.hasBeenDecoded) {
      hasError = true
      console.error(`${name}: result has not been decoded`)
    }

    let strResult = result.body.toString()
    if (strResult.length !== length) {
      hasError = true
      console.error(`${name}: result body length is not equal to length, got ${result.body.length}`)
    }

    if (!strResult.startsWith('<script src=/ping.js>')) {
      hasError = true
      console.error(`${name}: result body does not start with "<script src=/ping.js>", got ${strResult}`)
    }
  }

  let res = { headers: { 'content-encoding': 'gzip' } }
  let file = await fs.readFile('./TestFiles/file.gz')
  let decoded = await contentEncoding.tryDecodeHttpResponse(res, file)
  test('simple gzip', decoded, 175)

  res = { headers: { 'content-encoding': 'gzip, gzip' } }
  file = await fs.readFile('./TestFiles/file.gz.gz')
  decoded = await contentEncoding.tryDecodeHttpResponse(res, file)
  test('double gzip in single header', decoded, 189)

  res = { headers: { 'content-encoding': 'gzip, gzip' } }
  file = await fs.readFile('./TestFiles/file.gz.gz')
  decoded = await contentEncoding.tryDecodeHttpResponse(res, file)
  test('double gzip in seperate header', decoded, 189)

  res = { headers: { 'content-encoding': '                                             gzip' } }
  file = await fs.readFile('./TestFiles/file.gz')
  decoded = await contentEncoding.tryDecodeHttpResponse(res, file)
  test('"Content-encoding: <lots-of-spaces> gzip", served with gzip', decoded, 175)

  res = { headers: { 'content-encoding': 'deflate , ' } }
  file = await fs.readFile('./TestFiles/file.deflate')
  decoded = await contentEncoding.tryDecodeHttpResponse(res, file)
  test('content-encoding "deflate<nl> ,<nl> ", served with deflate', decoded, 181)

  res = { headers: { 'content-encoding': 'deflate, deflate' } }
  file = await fs.readFile('./TestFiles/file.deflate.deflate')
  decoded = await contentEncoding.tryDecodeHttpResponse(res, file)
  test('single content-encoding header "deflate, deflate", compressed twice with deflate', decoded, 201)

  res = { headers: { 'content-encoding': 'deflate , deflate' } }
  file = await fs.readFile('./TestFiles/file.deflate.deflate')
  decoded = await contentEncoding.tryDecodeHttpResponse(res, file)
  test('single content-encoding header "deflate<nl> ,<nl> deflate", compressed twice with deflate', decoded, 201)

  res = { headers: { 'content-encoding': 'gzip, deflate' } }
  file = await fs.readFile('./TestFiles/file.deflate.gz')
  decoded = await contentEncoding.tryDecodeHttpResponse(res, file)
  test('content-encoding header for gzip and deflate, content compressed in this order', decoded, 195)

  res = { headers: { 'content-encoding': 'gzip, deflate' } }
  file = await fs.readFile('./TestFiles/file.deflate.gz')
  decoded = await contentEncoding.tryDecodeHttpResponse(res, file)
  test('content-encoding header for gzip and deflate and in the middle a X-Foo:\n, content compressed in this order', decoded, 195)

  res = { headers: { 'content-encoding': 'gzip, deflate, gzip' } }
  file = await fs.readFile('./TestFiles/file.gz.deflate.gz')
  decoded = await contentEncoding.tryDecodeHttpResponse(res, file)
  test('served gzip + deflate + gzip, separate content-encoding header', decoded, 205)

  res = { headers: { 'content-encoding': 'deflate, identity, gzip' } }
  file = await fs.readFile('./TestFiles/file.gz.deflate')
  decoded = await contentEncoding.tryDecodeHttpResponse(res, file)
  test('served deflate + identity + gzip, three content-encoding headers', decoded, 195)

  if (hasError) process.exit(1)
  console.log('running tests done')
})()
