'use strict';

const stripe = require('stripe')('sk_test_51LYaObDOBGPSYv1PZDqIOulqqgWaVOBukSt7PxoB12RcTd0L0mC6fQcMvNusmftO8JpOHW4kNYezq0t6wnptkKUj00Nc6XyXdd');

const cities = require('./dynamo/cities');
const dynamo = require('./aws/dynamo');

const {APP_TABLE} = process.env;

const self = module.exports = {
  createInvoice: async (data) => {
    try {
      const {
        email,
        name,
        city_id,
        street,
        province,
        postal_code,
        phone,
        invoiceItem,
        price,
        userId,
        stripe_user_id,
        days_until_due,
        brokerage,
      } = data;

      const city = await cities.getCity(city_id);

      let customerId;

      const customers = await stripe.customers.list();

      let customer = customers?.data?.find(c => c.id === stripe_user_id);

      const params = {
        email,
        name,
        description: brokerage,
        address: {
          country: 'CA',
          line1: `${street}`,
          postal_code: postal_code,
          city: city?.name,
          state: province,
        },
        phone,
      };

      if (customer) {
        customerId = customer.id;

        await stripe.customers.update(customerId, params);

      } else {
        customer = await stripe.customers.create(params);

        customerId = customer.id;

        await self.storeCustomerStripeId(userId, customerId);
      }

      const product = await stripe.products.create({
        name: invoiceItem,
        tax_code: 'txcd_10103001',
      });

      const productPrice = await stripe.prices.create({
        unit_amount: price * 100,
        currency: 'cad',
        product: product.id,
        tax_behavior: 'exclusive',
      });

      const invoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: 'send_invoice',
        days_until_due: days_until_due,
        automatic_tax: {
          enabled: true,
        },
      });

      await stripe.invoiceItems.create({
        customer: customerId,
        price: productPrice.id,
        invoice: invoice.id,
      });

      return await stripe.invoices.sendInvoice(invoice.id);
    } catch (e) {
      throw e;
    }
  },
  createRecurringInvoice: async (data) => {
    try {
      const {
        email,
        name,
        city_id,
        street,
        province,
        postal_code,
        phone,
        invoiceItem,
        price,
        userId,
        stripe_user_id,
        days_until_due,
        brokerage,
      } = data;

      const city = await cities.getCity(city_id);

      let customerId;

      const customers = await stripe.customers.list();

      let customer = customers?.data?.find(c => c.id === stripe_user_id);

      const params = {
        email,
        name,
        description: brokerage,
        address: {
          country: 'CA',
          line1: `${street}`,
          postal_code: postal_code,
          city: city?.name,
          state: province,
        },
        phone,
      };

      if (customer) {
        customerId = customer.id;

        await stripe.customers.update(customerId, params);

      } else {
        customer = await stripe.customers.create(params);

        customerId = customer.id;

        await self.storeCustomerStripeId(userId, customerId);
      }

      const product = await stripe.products.create({
        name: invoiceItem,
        tax_code: 'txcd_10103001',
      });

      const productPrice = await stripe.prices.create({
        unit_amount: price * 100,
        currency: 'cad',
        product: product.id,
        tax_behavior: 'exclusive',
      });

      const invoice = await stripe.invoices.create({
        auto_advance: false,
        customer: customerId,
        collection_method: 'send_invoice',
        days_until_due: days_until_due,
        automatic_tax: {
          enabled: true,
        },
      });

      await stripe.invoiceItems.create({
        customer: customerId,
        price: productPrice.id,
        invoice: invoice.id,
      });

      return await stripe.invoices.sendInvoice(invoice.id);
    } catch (e) {
      throw e;
    }
  },

  storeCustomerStripeId: async(userId, userStripeId) => {
    const keys = {
      pk: `USER|${userId}`,
      sk: `ATTRIBUTES`,
    }
    await dynamo.updateSingleValue(APP_TABLE, keys, 'stripe_user_id', userStripeId);
  },
  listInvoices: async (stripe_user_id) => {
    const invoices = await stripe.invoices.list({
      customer: stripe_user_id,
      limit: 1000,
    });

    return invoices;
  },
  listProducts: async () => {
    const products = await stripe.products.list({
      limit: 1000,
    });

    return {
      ...products,
      data: products?.data?.filter((product) => product.active),
    };
  },
  listSubscription: async () => {
    const subscriptions = await stripe.subscriptions.list({
      limit: 100,
    });

    return {
      ...subscriptions,
      data: subscriptions?.data?.filter((subscription) => subscription.items.data[0].type === "recurring"),
    };
  },
  createSession: async (user, price_id, mode) => {

    const stripe_user_id = user?.attributes?.stripe_user_id;

    const billing_address = user?.billing_address;

    let customerId;

    const customers = await stripe.customers.list();

    let customer = customers?.data?.find(c => c.id === stripe_user_id);

    const city = await cities.getCity(billing_address?.city_id);

    const params = {
      email: billing_address?.email,
      name: billing_address?.contact_name,
      description: billing_address?.name,
      address: {
        country: 'CA',
        line1: billing_address?.address_line_1,
        postal_code: billing_address?.postal_code,
        city: city?.name,
        state: billing_address?.province,
      },
      phone: billing_address?.phone,
    };

    if (customer) {
      customerId = customer.id;

      await stripe.customers.update(customerId, params);

    } else {
      customer = await stripe.customers.create(params);

      customerId = customer.id;

      await self.storeCustomerStripeId(user?.id, customerId);
    }

    const session = await stripe.checkout.sessions.create({
      success_url:
        'https://realinfobox.wixsite.com/website-1/thank-you-page-order',
      cancel_url: 'https://realinfobox.wixsite.com/website-1/order-declined',
      line_items: [
        {
          price: price_id,
          quantity: 1,
        },
      ],
      automatic_tax: {
        enabled: true,
      },
      customer: customerId,
      mode: mode,
      allow_promotion_codes: true,
    });
    return session;
  },
}

