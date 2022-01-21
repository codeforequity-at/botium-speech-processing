const fs = require('fs')
const _ = require('lodash')
const sanitize = require('sanitize-filename')
const speechScorer = require('word-error-rate')
const { IamAuthenticator } = require('ibm-watson/auth')
const { SpeechConfig, SpeechSynthesisOutputFormat, OutputFormat, ResultReason, CancellationDetails, CancellationReason, CancellationErrorCode } = require('microsoft-cognitiveservices-speech-sdk')

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

const enumValueToName = (obj, value) => {
  return Object.keys(obj)[Object.values(obj).findIndex(x => x === value)]
}

const _cleanString = (str) => str.toLowerCase().replace(/[\W_]+/g, ' ').split(' ').filter(s => s && s.length > 0).join(' ')

const wer = async (text1, text2) => {
  const from = _cleanString(text1 || '')
  const to = _cleanString(text2 || '')
  return {
    distance: speechScorer.calculateEditDistance(from, to),
    wer: speechScorer.wordErrorRate(from, to)
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

const pollyOptions = (req) => {
  const region = _.get(req, 'body.polly.credentials.region') || process.env.BOTIUM_SPEECH_AWS_REGION
  const accessKeyId = _.get(req, 'body.polly.credentials.accessKeyId') || process.env.BOTIUM_SPEECH_AWS_ACCESS_KEY_ID
  const secretAccessKey = _.get(req, 'body.polly.credentials.secretAccessKey') || process.env.BOTIUM_SPEECH_AWS_SECRET_ACCESS_KEY

  if (region && accessKeyId && secretAccessKey) {
    return {
      region,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    }
  }
  throw new Error('AWS Polly credentials not found')
}

const awstranscribeOptions = (req) => {
  const region = _.get(req, 'body.awstranscribe.credentials.region') || process.env.BOTIUM_SPEECH_AWS_REGION
  const accessKeyId = _.get(req, 'body.awstranscribe.credentials.accessKeyId') || process.env.BOTIUM_SPEECH_AWS_ACCESS_KEY_ID
  const secretAccessKey = _.get(req, 'body.awstranscribe.credentials.secretAccessKey') || process.env.BOTIUM_SPEECH_AWS_SECRET_ACCESS_KEY

  if (region && accessKeyId && secretAccessKey) {
    return {
      region,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    }
  }
  throw new Error('AWS Transcribe credentials not found')
}

const azureSpeechConfig = (req) => {
  const subscriptionKey = _.get(req, 'body.azure.credentials.subscriptionKey') || process.env.BOTIUM_SPEECH_AZURE_SUBSCRIPTION_KEY
  const region = _.get(req, 'body.azure.credentials.region') || process.env.BOTIUM_SPEECH_AZURE_REGION

  if (subscriptionKey && region) {
    return SpeechConfig.fromSubscription(subscriptionKey, region)
  }
  throw new Error('Azure Subscription credentials not found')
}

const applyExtraAzureSpeechConfig = (speechConfig, req) => {
  const extraAzureSpeechConfig = _.get(req, 'body.azure.config.speechConfig')
  if (extraAzureSpeechConfig) {
    if (extraAzureSpeechConfig.speechSynthesisOutputFormat) {
      if (_.isNumber(SpeechSynthesisOutputFormat[extraAzureSpeechConfig.speechSynthesisOutputFormat])) {
        extraAzureSpeechConfig.speechSynthesisOutputFormat = SpeechSynthesisOutputFormat[extraAzureSpeechConfig.speechSynthesisOutputFormat]
      }
    }
    if (extraAzureSpeechConfig.outputFormat) {
      if (_.isNumber(OutputFormat[extraAzureSpeechConfig.outputFormat])) {
        extraAzureSpeechConfig.outputFormat = OutputFormat[extraAzureSpeechConfig.outputFormat]
      }
    }
    Object.assign(speechConfig, extraAzureSpeechConfig)
  }
}

const getAzureErrorDetails = (result) => {
  if (result.reason === ResultReason.Canceled) {
    const cancellation = CancellationDetails.fromResult(result)
    if (cancellation.reason === CancellationReason.Error) {
      return `CANCELED: ErrorCode=${enumValueToName(CancellationErrorCode, cancellation.ErrorCode)} - ${cancellation.errorDetails}`
    } else {
      return `CANCELED: Reason=${enumValueToName(CancellationReason, cancellation.reason)} - ${result.errorDetails}`
    }
  }
  return result.errorDetails
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
  enumValueToName,
  wer,
  ttsFilename,
  googleOptions,
  ibmSttOptions,
  ibmTtsOptions,
  pollyOptions,
  awstranscribeOptions,
  azureSpeechConfig,
  applyExtraAzureSpeechConfig,
  getAzureErrorDetails,
  readBaseUrls
}
