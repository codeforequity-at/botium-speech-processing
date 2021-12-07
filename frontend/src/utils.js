const fs = require('fs')
const _ = require('lodash')
const sanitize = require('sanitize-filename')
const speechScorer = require('word-error-rate')
const { IamAuthenticator } = require('ibm-watson/auth')

const asJson = (str) => {
  if (str && _.isString(str)) {
    try {
      return JSON.parse(str)
    } catch (err) {
      return null
    }
  } else if (_.isObject(str)) {
    return str
  } else {
    return null
  }
}

const wer = async (text1, text2) => {
  return {
    distance: speechScorer.calculateEditDistance(text1 || '', text2 || ''),
    wer: speechScorer.wordErrorRate(text1 || '', text2 || '')
  }
}

const ttsFilename = (text) => {
  const shortenedText = _.truncate(text, { length: 500 })
  return sanitize(shortenedText) || 'unknown'
}

const cleanEnv = (envName) => {
  return process.env[envName] && process.env[envName].replace(/\\n/g, '\n')
}

const googleOptions = (req) => {
  const privateKey = _.get(req, 'body.google.credentials.private_key') || cleanEnv('BOTIUM_SPEECH_GOOGLE_PRIVATE_KEY')
  const clientEmail = _.get(req, 'body.google.credentials.client_email') || process.env.BOTIUM_SPEECH_GOOGLE_CLIENT_EMAIL

  if (privateKey && clientEmail) {
    return { credentials: { private_key: privateKey, client_email: clientEmail } }
  }
  const keyFilename = process.env.BOTIUM_SPEECH_GOOGLE_KEYFILE
  if (keyFilename) {
    if (!fs.existsSync(keyFilename)) throw new Error(`Google Cloud credentials file "${keyFilename}" not found`)
    return { keyFilename }
  }
  throw new Error('Google Cloud credentials not found')
}

const ibmSttOptions = (req) => {
  const apikey = _.get(req, 'body.ibm.credentials.apikey') || process.env.BOTIUM_SPEECH_IBM_STT_APIKEY
  const serviceUrl = _.get(req, 'body.ibm.credentials.serviceUrl') || process.env.BOTIUM_SPEECH_IBM_STT_SERVICEURL

  if (apikey && serviceUrl) {
    return {
      authenticator: new IamAuthenticator({ apikey: apikey }),
      serviceUrl: serviceUrl
    }
  }
  throw new Error('IBM Cloud credentials not found')
}
const ibmTtsOptions = (req) => {
  const apikey = _.get(req, 'body.ibm.credentials.apikey') || process.env.BOTIUM_SPEECH_IBM_TTS_APIKEY
  const serviceUrl = _.get(req, 'body.ibm.credentials.serviceUrl') || process.env.BOTIUM_SPEECH_IBM_TTS_SERVICEURL

  if (apikey && serviceUrl) {
    return {
      authenticator: new IamAuthenticator({ apikey: apikey }),
      serviceUrl: serviceUrl
    }
  }
  throw new Error('IBM Cloud credentials not found')
}

const readBaseUrls = (req) => {
  const proto = process.env.BOTIUM_SPEECH_URL ? process.env.BOTIUM_SPEECH_URL.split('://')[0] : req.protocol
  const host = process.env.BOTIUM_SPEECH_URL ? process.env.BOTIUM_SPEECH_URL.split('://')[1] : req.headers['x-forwarded-host'] ? req.headers['x-forwarded-host'] : req.get('host')

  return {
    wsUri: `${proto === 'https' ? 'wss' : 'ws'}://${host}`,
    baseUri: `${proto}://${host}`
  }
}

module.exports = {
  asJson,
  wer,
  ttsFilename,
  googleOptions,
  ibmSttOptions,
  ibmTtsOptions,
  readBaseUrls
}
