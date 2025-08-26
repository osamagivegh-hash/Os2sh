const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productName: String,
  price: Number,
  from: String,
  nutrients: String,
  quantity: String,
  description: String,
  organic: Boolean,
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
