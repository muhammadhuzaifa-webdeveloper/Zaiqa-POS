const mongoose = require('mongoose');
const { Schema } = mongoose;
const OID = Schema.Types.ObjectId;
const opts = {
  timestamps: true,
  toJSON: { versionKey: false, transform: (d, r) => { r.id = r._id; delete r._id; delete r.password; return r; } },
};

const User = mongoose.model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  phone: String,
  role: { type: String, enum: ['customer', 'restaurant_admin', 'admin'], default: 'customer' },
  isBlocked: { type: Boolean, default: false },
  passwordChangedAt: Date,
}, opts));

const Restaurant = mongoose.model('Restaurant', new Schema({
  name: { type: String, required: true, trim: true },
  description: String,
  owner: { type: OID, ref: 'User', required: true, index: true },
  phone: String, email: String, address: String,
  city: { type: String, index: true },
  image: String,
  openingTime: { type: String, default: '10:00' },
  closingTime: { type: String, default: '23:00' },
  isOpen: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  deliveryFee: { type: Number, default: 150, min: 0 },
}, opts));

const catSchema = new Schema({
  restaurant: { type: OID, ref: 'Restaurant', required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: String, image: String,
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, opts);
catSchema.index({ restaurant: 1, name: 1 }, { unique: true });
const Category = mongoose.model('Category', catSchema);

const MenuItem = mongoose.model('MenuItem', new Schema({
  restaurant: { type: OID, ref: 'Restaurant', required: true, index: true },
  category: { type: OID, ref: 'Category', required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: String,
  price: { type: Number, required: true, min: 0 },
  discountPrice: { type: Number, min: 0 },
  image: String,
  ingredients: [String],
  isAvailable: { type: Boolean, default: true },
  preparationTime: { type: Number, default: 15 },
}, opts));

const Cart = mongoose.model('Cart', new Schema({
  user: { type: OID, ref: 'User', required: true, unique: true },
  restaurant: { type: OID, ref: 'Restaurant' },
  items: [{ _id: false, menuItem: { type: OID, ref: 'MenuItem' }, quantity: { type: Number, min: 1 }, price: Number }],
  subtotal: { type: Number, default: 0 }, deliveryFee: { type: Number, default: 0 },
  discount: { type: Number, default: 0 }, total: { type: Number, default: 0 },
}, opts));

const Order = mongoose.model('Order', new Schema({
  orderNumber: { type: String, unique: true, required: true },
  user: { type: OID, ref: 'User', index: true },
  restaurant: { type: OID, ref: 'Restaurant', required: true, index: true },
  source: { type: String, enum: ['online', 'pos'], default: 'online' },
  orderType: { type: String, enum: ['delivery', 'dine_in', 'takeaway'], default: 'delivery' },
  table: String, customerName: String,
  items: [{ _id: false, menuItem: OID, name: String, price: Number, quantity: Number, subtotal: Number }],
  deliveryAddress: { address: String, city: String, postalCode: String },
  phone: String,
  subtotal: Number, deliveryFee: { type: Number, default: 0 }, discount: { type: Number, default: 0 }, total: Number,
  paymentMethod: { type: String, enum: ['cash', 'card', 'online'], default: 'cash' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  orderStatus: { type: String, enum: ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'], default: 'pending', index: true },
  notes: String,
  createdBy: { type: OID, ref: 'User' },
}, opts));

const unit = (m) => (m.discountPrice != null && m.discountPrice < m.price ? m.discountPrice : m.price);
module.exports = { User, Restaurant, Category, MenuItem, Cart, Order, unit };
