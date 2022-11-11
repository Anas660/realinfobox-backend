const defaultBlocks = [
  {
    block_id: 'social-block',
    name: 'Social Media',
    type: 'social',
  },
].map(b => ({...b, default: true}))

const self = module.exports = {
  defaultBlocks,
}
