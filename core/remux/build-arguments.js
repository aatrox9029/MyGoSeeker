import { buildInputArguments } from "./build-input-arguments.js";

export function buildRemuxArguments(job) {
  const args = ["-y", ...buildInputArguments(job.video)];
  if (job.audio && !job.audioOnly) args.push(...buildInputArguments(job.audio), "-map", "0:v:0", "-map", "1:a:0");
  if (job.audioOnly) args.push("-map", "0:a:0", "-vn");
  args.push("-c", "copy");
  if (!job.outputFormat || job.outputFormat.container === "mp4") args.push("-movflags", "+faststart");
  args.push(job.outputFileName);
  return args;
}

