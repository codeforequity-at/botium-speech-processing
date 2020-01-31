#!/bin/bash

set -x

mkdir -p /app/watch/stt_input_de
mkdir -p /app/watch/stt_input_en
mkdir -p /app/watch/stt_output
mkdir -p /app/watch/stt_temp

inotifywait -m /app/watch/stt_input_de /app/watch/stt_input_en -e close_write |
  while read path action file; do
    if [[ "$path" =~ .*stt_input_de.* ]]; then
      language=de
    elif [[ "$path" =~ .*stt_input_en.* ]]; then
      language=en
    else
      mv -f $path$file /app/watch/stt_output/$file.err_language_not_supported
      continue
    fi
    if [[ "$file" =~ .*mp3$ ]]; then
      profile=mp3tomonowav
      contenttype=audio/mp3
    elif [[ "$file" =~ .*wav$ ]]; then
      profile=wavtomonowav
      contenttype=audio/wav
    else
      mv -f $path$file /app/watch/stt_output/$file.err_filetype_not_supported
      continue
    fi
    curl -s -S -X POST "http://frontend:56000/api/convert/$profile" -H "Content-Type: $contenttype" -T $path$file -o /app/watch/stt_temp/$file.wav
    if [ $? -ne 0 ]; then
      mv -f $path$file /app/watch/stt_output/$file.err_convert
      rm -f /app/watch/stt_temp/$file.wav
      continue
    fi
    curl -s -S -X POST "http://frontend:56000/api/stt/$language" -H "Content-Type: audio/wav" -T /app/watch/stt_temp/$file.wav -o /app/watch/stt_output/$file.json
    if [ $? -ne 0 ]; then
      mv -f $path$file /app/watch/stt_output/$file.err_stt
      rm -f /app/watch/stt_temp/$file.wav
      continue
    fi
    cat /app/watch/stt_output/$file.json | jq -r .text > /app/watch/stt_output/$file.txt
    mv -f $path$file /app/watch/stt_output/$file
    rm -f /app/watch/stt_temp/$file.wav
  done
