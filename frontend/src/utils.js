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
  const privateKey = (req && req.body && req.body.google && req.body.google.private_key) || cleanEnv('BOTIUM_SPEECH_GOOGLE_PRIVATE_KEY')
  const clientEmail = (req && req.body && req.body.google && req.body.google.client_email) || process.env.BOTIUM_SPEECH_GOOGLE_CLIENT_EMAIL

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
  const apikey = (req && req.body && req.body.ibm && req.body.ibm.apikey) || process.env.BOTIUM_SPEECH_IBM_STT_APIKEY
  const serviceUrl = (req && req.body && req.body.ibm && req.body.ibm.serviceUrl) || process.env.BOTIUM_SPEECH_IBM_STT_SERVICEURL

  if (apikey && serviceUrl) {
    return {
      authenticator: new IamAuthenticator({ apikey: apikey }),
      serviceUrl: serviceUrl
    }
  }
  throw new Error('IBM Cloud credentials not found')
}
const ibmTtsOptions = (req) => {
  const apikey = (req && req.body && req.body.ibm && req.body.ibm.apikey) || process.env.BOTIUM_SPEECH_IBM_TTS_APIKEY
  const serviceUrl = (req && req.body && req.body.ibm && req.body.ibm.serviceUrl) || process.env.BOTIUM_SPEECH_IBM_TTS_SERVICEURL

  if (apikey && serviceUrl) {
    return {
      authenticator: new IamAuthenticator({ apikey: apikey }),
      serviceUrl: serviceUrl
    }
  }
  throw new Error('IBM Cloud credentials not found')
}

module.exports = {
  asJson,
  wer,
  ttsFilename,
  googleOptions,
  ibmSttOptions,
  ibmTtsOptions
}
