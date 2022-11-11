const cities = require('../services/dynamo/cities')
const {fail} = require('../services/responses');

const self = module.exports = {
  list: async (req, res) => {
    try {
      const list = await cities.getAllCities();

      res.json(list);

    } catch (error) {
      fail(res, error);
    }
  },
  create: async (req, res) => {
    try {
      const {name, timezone} = req.body;

      const {id} = await cities.createCity({name, timezone});

      res.json({
        id,
      });

    } catch (error) {
      fail(res, error);
    }
  },

  update: async (req, res) => {
    try {
      const {cityId} = req.params;
      const {name, timezone} = req.body;
      const result = await cities.updateCity(cityId, {name, timezone})

      res.json({
        message: 'Updated successfully',
      });

    } catch (error) {
      fail(res, error);
    }
  },
}
