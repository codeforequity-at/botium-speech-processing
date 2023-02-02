const util = require('util')
const _ = require('lodash')
const Mustache = require('mustache')
const request = require('request-promise-native')
const { WebSocket } = require('ws')
const EventEmitter = require('events')
const debug = require('debug')('botium-speech-processing-kaldi')

const getKaldiUrl = (language) => {
  const envVarUrl = `BOTIUM_SPEECH_KALDI_URL_${language.toUpperCase()}`
  if (!process.env[envVarUrl]) throw new Error(`Language ${language.toUpperCase()} for Kaldi not available`)
  return Mustache.render(process.env[envVarUrl], { language })
}

class KaldiSTT {
  async languages (req) {
    const envKeys = Object.keys(process.env).filter(k => k.startsWith('BOTIUM_SPEECH_KALDI_URL_'))
    return _.uniq(envKeys.map(k => k.split('_')[4].toLowerCase())).sort()
  }

  stt_OpenStream (req, { language }) {
    return new Promise((resolve, reject) => {
      const kaldiUrl = getKaldiUrl(language)

      const qs = {
        'content-type': 'audio/x-wav',
        '+layout': '(string)interleaved',
        '+rate': '(int)16000',
        '+format': '(string)S16LE',
        '+channels': '(int)1'
      }
      if (req.body && req.body.kaldi && req.body.kaldi.config) {
        Object.assign(qs, req.body.kaldi.config)
      }

      const wsUri = (kaldiUrl.indexOf('?') > 0 ? kaldiUrl.substr(0, kaldiUrl.indexOf('?')) : kaldiUrl)
        .replace('http://', 'ws://')
        .replace('https://', 'wss://')
        .replace('dynamic/recognize', 'ws/speech') +
        '?' + Object.keys(qs).map(p => `${p}=${qs[p]}`).join(',')
      debug('wsUri', wsUri)

      const ws = new WebSocket(wsUri)
      const events = new EventEmitter()

      ws.on('open', () => {
        ws.on('message', (data) => {
          try {
            const dj = JSON.parse(data)
            const hypotheses = dj.result && dj.result.hypotheses && dj.result.hypotheses[0]
            if (hypotheses && hypotheses.transcript) {
              const event = {
                text: hypotheses.transcript,
                final: !!dj.result.final,
                debug: dj
              }
              if (dj['total-length']) {
                event.start = _.round(_.toNumber(dj['total-length']) - _.toNumber(dj['segment-length']), 3)
                event.end = _.round(_.toNumber(dj['total-length']), 3)
              }
              events.emit('data', event)
            }
          } catch (err) {
            debug(`received non JSON content on stream, ignoring. ${err.message}`)
          }
        })
        ws.on('error', (err) => {
          events.emit('data', {
            err: `${err.message}`
          })
        })
        ws.on('close', () => {
          events.emit('close')
        })

        resolve({
          events,
          write: (buffer) => {
            if (ws) {
              ws.send(buffer)
            }
          },
          end: () => {
            if (ws) {
              ws.send('EOS')
            }
          },
          close: () => {
            if (ws) {
              ws.close()
            }
          }
        })
      })
      ws.on('error', (err) => reject(new Error(`Failed to open Kaldi stream to ${wsUri}: ${err.message}`)))
    })
  }

  async stt (req, { language, buffer }) {
    const requestOptions = {
      method: 'PUT',
      uri: getKaldiUrl(language),
      body: buffer,
      resolveWithFullResponse: true,
      simple: false
    }

    let response
    try {
      debug(`Calling kaldi url ${requestOptions.uri} ...`)
      response = await request(requestOptions)
    } catch (err) {
      throw new Error(`Calling url ${requestOptions.uri} failed: ${err.message}`)
    }
    if (response.statusCode === 200) {
      const body = JSON.parse(response.body)
      debug(`Called url ${requestOptions.uri} success: ${util.inspect(body)}`)
      if (body.status === 0) {
        if (body.hypotheses && body.hypotheses[0].utterance) {
          return {
            text: body.hypotheses[0].utterance,
            debug: body
          }
        } else {
          return {
            text: '',
            debug: body
          }
        }
      } else {
        throw new Error(`Kaldi failed with code ${body.status}: ${body.message}`)
      }
    } else {
      throw new Error(`Calling url ${requestOptions.uri} failed with code ${response.statusCode}: ${response.statusMessage}`)
    }
  }
}

module.exports = KaldiSTT
