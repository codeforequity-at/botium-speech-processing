const fs = require('fs')
const Mustache = require('mustache')
const { spawn } = require('child_process')
const { v1: uuidv1 } = require('uuid')
const debug = require('debug')('botium-speech-processing-convert')

const runconvert = (cmdLine, outputFile, { inputBuffer, start, end }) => {
  return new Promise((resolve, reject) => {
    const output = `${process.env.BOTIUM_SPEECH_TMP_DIR || '/tmp'}/${uuidv1()}_${outputFile}`

    let cmdLineFull = Mustache.render(cmdLine, { output })
    if (start && end) {
      cmdLineFull = `${cmdLineFull} trim ${start} ${end}`
    } else if (start && !end) {
      cmdLineFull = `${cmdLineFull} trim ${start}`
    } else if (!start && end) {
      cmdLineFull = `${cmdLineFull} trim 0 ${end}`
    }
    debug(`cmdLineFull: ${cmdLineFull}`)
    const childProcess = spawn('/bin/sh', ['-c', cmdLineFull])

    childProcess.once('exit', (code, signal) => {
      debug(`conversion process exited with code ${code}, signal ${signal}`)
      if (code === 0) {
        try {
          const outputBuffer = fs.readFileSync(output)
          fs.unlinkSync(output)
          resolve(outputBuffer)
        } catch (err) {
          reject(new Error(`conversion process output file ${output} not readable: ${err.message}`))
        }
      } else {
        reject(new Error(`conversion process exited with code ${code}, signal ${signal}`))
      }
    })
    childProcess.once('error', (err) => {
      debug(`conversion process failed: ${err.message}`)
      reject(new Error(`conversion process failed: ${err.message}`))
    })
    childProcess.stdout.on('error', (err) => {
      debug('stdout err ' + err)
    })
    childProcess.stderr.on('error', (err) => {
      debug('stderr err ' + err)
    })
    childProcess.stdin.on('error', (err) => {
      debug('stdin err ' + err)
    })
    childProcess.stderr.on('data', (data) => {
      debug('stderr ' + data)
    })

    childProcess.stdin.write(inputBuffer)
    childProcess.stdin.end()
  })
}

module.exports = {
  runconvert
}
