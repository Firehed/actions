import * as core from '@actions/core'
import * as exec from '@actions/exec'

async function run(): Promise<void> {
  try {
    // core.info(JSON.stringify(process.env))

    await build()
  } catch (error) {
    core.setFailed(error.message)
  }
}


async function build(): Promise<void> {
  const stages = core.getInput('stages').split(',').map(stage => stage.trim())
  for (const stage of stages) {
    await buildStage(stage)
  }

  const testStage = core.getInput('testenv-stage').trim()
  const testTagBranch = await buildStage(testStage)
  const testTag = await tagCommit(testTagBranch)

  const serverStage = core.getInput('server-stage').trim()
  const serverTagBranch = await buildStage(serverStage)
  const serverTag = await tagCommit(serverTagBranch)

  core.setOutput('testenv-tag', testTag)
  core.setOutput('server-tag', serverTag)
}

async function buildStage(stage: string): Promise<string> {
  const repo = core.getInput('repository')
  const dockerfile = core.getInput('dockerfile')

  // TODO: :this-branch || :default-branch
  const tag = `${repo}/${stage}`
  core.debug(`Pulling ${tag}`)
  try {
    await exec.exec('docker', [
      'pull',
      tag,
    ])
    await exec.exec('docker', [
      'tag',
      tag,
      stage,
    ])
  } catch (error) {
    // Initial pull failing is OK
  }
  core.debug(`Building ${tag}`)
  const result = await exec.exec('docker', [
    'build',
    '--build-arg', 'BUILDKIT_INLINE_CACHE="1"',
    '--cache-from', stage,
    '--file', dockerfile,
    '--tag', tag,
    '--target', stage,
    '.'
  ])
  if (result > 0) {
    throw 'Docker build failed'
  }
  core.debug(`Pushing ${tag}`)
  const pushResult = await exec.exec('docker', [
    'push',
    tag,
  ])
  if (pushResult > 0) {
    throw 'Docker push failed'
  }

  return tag
}

async function tagCommit(branchTag: string): Promise<string> {
  await exec.exec('git log --pretty=oneline')
  await exec.exec('git rev-parse HEAD')
  // FIXME: if above is not a merge commit (for the goofy ci thing), use it.
  // otherwise track down real commit and splice that in
  return branchTag
}

run()
