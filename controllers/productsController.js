const products = require('../services/dynamo/products')
const {fail} = require('../services/responses');

const self = module.exports = {
  list: async (req, res) => {
    try {
      const list = await products.getAllProducts();

      res.json(list);

    } catch (error) {
      fail(res, error);
    }
  },
  create: async (req, res) => {
    try {
      const {name, allows} = req.body;

      const {id} = await products.createProduct({name, allows});

      res.json({
        id,
      });

    } catch (error) {
      fail(res, error);
    }
  },

  update: async (req, res) => {
    try {
      const {productId} = req.params;
      const {name, allows} = req.body;
      const result = await products.updateProduct(productId, {name, allows})
      res.json({
        message: 'Updated successfully',
      });

    } catch (error) {
      fail(res, error);
    }
  },
}
