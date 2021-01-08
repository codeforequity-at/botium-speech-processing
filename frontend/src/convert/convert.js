const fs = require('fs')
const Mustache = require('mustache')
const { spawn, exec } = require('child_process')
const { v1: uuidv1 } = require('uuid')
const debug = require('debug')('botium-speech-processing-convert')

const _getSoxFileType = (filename) => {
  return new Promise((resolve, reject) => {
    exec(`soxi -t ${filename}`, (err, stdout, stderr) => {
      if (err) return reject(err)
      if (stderr) return reject(stderr.trim())
      resolve(stdout.trim())
    })
  })
}

const _isMP3 = (buf) => {
  if (!buf || buf.length < 3) {
    return false
  }
  return (buf[0] === 73 &&
    buf[1] === 68 &&
    buf[2] === 51) || (
    buf[0] === 255 &&
      (buf[1] === 251 || buf[1] === 250)
  )
}

const runconvert = async (cmdLine, outputName, { inputBuffer, start, end }) => {
  const jobId = uuidv1()

  const writeInput = !outputName || cmdLine.indexOf('{{{input}}}') >= 0 || cmdLine.indexOf('{{{inputtype}}}') >= 0

  let input = null
  let inputtype = null

  if (writeInput) {
    input = `${process.env.BOTIUM_SPEECH_TMP_DIR || '/tmp'}/${jobId}_input`
    try {
      fs.writeFileSync(input, inputBuffer)
    } catch (err) {
      debug(`conversion process input file ${input} not writable: ${err.message}`)
      throw new Error('conversion process input file not writable')
    }
    if (_isMP3(inputBuffer)) {
      inputtype = 'mp3'
    } else {
      try {
        inputtype = await _getSoxFileType(input)
        debug(`Identified input type: ${inputtype}`)
      } catch (err) {
        debug(`identification of input file type ${input} failed: ${err.message}`)
        throw new Error('identification of input file type failed')
      }
    }
    if (!outputName) {
      outputName = `output.${inputtype}`
    }
  }
  const output = `${process.env.BOTIUM_SPEECH_TMP_DIR || '/tmp'}/${jobId}_${outputName}`

  let cmdLineFull = Mustache.render(cmdLine, { output, input, inputtype })
  if (start && end) {
    cmdLineFull = `${cmdLineFull} trim ${start} ${end}`
  } else if (start && !end) {
    cmdLineFull = `${cmdLineFull} trim ${start}`
  } else if (!start && end) {
    cmdLineFull = `${cmdLineFull} trim 0 ${end}`
  }
  debug(`cmdLineFull: ${cmdLineFull}`)

  return new Promise((resolve, reject) => {
    const childProcess = spawn('/bin/sh', ['-c', cmdLineFull])

    childProcess.once('exit', (code, signal) => {
      debug(`conversion process exited with code ${code}, signal ${signal}`)
      if (code === 0) {
        try {
          const outputBuffer = fs.readFileSync(output)
          fs.unlinkSync(output)
          resolve({
            outputName,
            outputBuffer
          })
        } catch (err) {
          reject(new Error(`conversion process output file ${output} not readable: ${err.message}`))
        }
      } else {
        reject(new Error(`conversion process exited with code ${code}, signal ${signal}`))
      }
      if (input) {
        try {
          fs.unlinkSync(input)
        } catch (err) {
          debug(`conversion process input file ${input} not deleted: ${err.message}`)
        }
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

    if (cmdLine.indexOf('{{{input}}}') < 0) {
      childProcess.stdin.write(inputBuffer)
    }
    childProcess.stdin.end()
  })
}

module.exports = {
  runconvert
}
