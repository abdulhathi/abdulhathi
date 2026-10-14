import { readFile } from 'node:fs';
import path from 'node:path';
import { FIXTURES, receipt, type Country, type Customer, type Order } from './lib/shop.ts';

// Error-first callbacks: callback(error, result). Each step nests inside the last.
readFile(path.join(FIXTURES, 'order.json'), 'utf8', (err, orderText) => {
  if (err) return console.error('Could not read the order:', err.message);
  const order = JSON.parse(orderText) as Order;
  console.log('2. read the order');

  readFile(path.join(FIXTURES, `customer-${order.customerId}.json`), 'utf8', (err, customerText) => {
    if (err) return console.error('Could not read the customer:', err.message);
    const customer = JSON.parse(customerText) as Customer;
    console.log('3. read the customer');

    readFile(path.join(FIXTURES, `country-${customer.country}.json`), 'utf8', (err, countryText) => {
      if (err) return console.error('Could not read the country:', err.message);
      const country = JSON.parse(countryText) as Country;
      console.log('4.', receipt(order, customer, country));
    });
  });
});

console.log('1. asked for order.json; the callbacks run later');
