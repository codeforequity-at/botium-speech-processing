#!/bin/sh

set -eu

input_path=$1
output_path=$2
background_path=$3
shift 3

if [ ! -f "$background_path" ]; then
  echo "Background sound not found: $background_path" >&2
  exit 1
fi

input_duration=$(soxi -D "$input_path")
input_rate=$(soxi -r "$input_path")
input_channels=$(soxi -c "$input_path")
background_duration=$(soxi -D "$background_path")

repeat_count=$(awk -v input="$input_duration" -v background="$background_duration" 'BEGIN {
  copies = int(input / background)
  if ((copies * background) < input) copies++
  print (copies > 0 ? copies - 1 : 0)
}')

background_repeated_path=$(mktemp /tmp/botium-background-repeat.XXXXXX.wav)
background_mix_path=$(mktemp /tmp/botium-background-mix.XXXXXX.wav)
trap 'rm -f "$background_repeated_path" "$background_mix_path"' EXIT HUP INT TERM

sox "$background_path" "$background_repeated_path" repeat "$repeat_count"
sox "$background_repeated_path" -r "$input_rate" -c "$input_channels" \
  "$background_mix_path" trim 0 "$input_duration"

sox -G -m -v 1 "$input_path" -v 0.20 "$background_mix_path" "$output_path" "$@"
