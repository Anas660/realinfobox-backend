const _ = require('lodash');
const {nanoid} = require('nanoid');

const self = module.exports = {
  zipBlocksFromBlockOrder: (blockOrder, defaultBlocks, userBlocks) => {
    const blocks = [];
    blockOrder.forEach(blockId => {
      let found = defaultBlocks.find(bl => bl.block_id === blockId);
      if (!found) {
        found = userBlocks.find(bl => bl.block_id === blockId);
      }

      if (found)
        blocks.push(found);
      else {
        /**
         * in case the block set was modified,
         * it can happen, that the client template has default blocks that are no longer available,
         * Just disregard them.
         */
      }
    })
    return blocks;
  },

  createDynamoBlocksRow: (blocks) => {
    const isDefaultFcn = (bl) => (bl.default);
    const userBlocks = blocks.filter(b => !isDefaultFcn(b));
    const defaultBlocks = blocks.filter(isDefaultFcn);

    const blocksToProcess = userBlocks.length ? userBlocks : defaultBlocks;

    // we split the array to individual blocks for saving,
    const blockObject = {};

    let blockOrder = blocks.map(bl => bl.block_id);
    blocksToProcess.forEach((block, index) => {
      const isDefault = isDefaultFcn(block)
      const newBlockId = isDefault ? `block-${index}` : `block-${nanoid(10)}`;
      const newObj = {
        ...block,
        default: isDefault,
      }
      if (!isDefault) {
        // replace the old blockId with our new one in block order
        // find the renamed block
        const index = blockOrder.findIndex(blockId => blockId === block.block_id);
        if (~index) blockOrder.splice(index, 1, newBlockId); //replace it
      }

      if (newObj.text === '') newObj.text = null

      const finalBlockId = isDefault ? block.block_id : newBlockId;
      blockObject[finalBlockId] = {
        ...newObj,
        block_id: finalBlockId,
      };
    });

    return {
      block_order: blockOrder,
      ...blockObject,
    }
  },

  parseBlocksRow: (blocksRow) => {
    if (!blocksRow.sk.includes('BLOCKS')) throw {message: 'Not a block row', row: blocksRow};
    let blocksObject = _.pickBy(blocksRow, (value, key) => key.match(/^(default:)?(block-)/));

    let blocksOrder = blocksRow.block_order || undefined;
    const sortedBlocks = [];
    if (blocksOrder) {
      blocksOrder.forEach(blockId => {
        const foundBlock = blocksObject[blockId];
        if (foundBlock) {
          sortedBlocks.push({
            ...foundBlock,
            block_id: blockId,
          })
        }
      })
    }

    return {
      blocks: sortedBlocks,
      block_order: blocksOrder,
    }
  },
}
