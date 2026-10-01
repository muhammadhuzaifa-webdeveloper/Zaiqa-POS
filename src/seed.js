require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Restaurant, Category, MenuItem, Cart, Order } = require('./models');

const DATA = [
  { name: 'Zaiqa Karahi House', city: 'Karachi', owner: 0, address: 'Block 5, Clifton', desc: 'Charcoal grills and slow-cooked karahi', menu: {
    BBQ: [['Chicken Tikka', 650, 'Charcoal-grilled leg piece'], ['Seekh Kabab', 520, 'Four juicy beef skewers']],
    Karahi: [['Chicken Karahi', 1800, 'Tomato, ginger, green chili, serves 2'], ['Mutton Karahi', 3200, 'Bone-in, slow cooked, serves 2']],
    Rice: [['Chicken Biryani', 480, 'Spiced long-grain rice'], ['Beef Pulao', 450, 'Yakhni pulao with raita']],
    Breads: [['Garlic Naan', 120, 'Tandoor baked'], ['Roghni Naan', 140, 'Sesame topped']],
    Drinks: [['Mint Margarita', 220, 'Fresh mint and lemon'], ['Sweet Lassi', 250, 'Thick, chilled']] } },
  { name: 'Burger Lab', city: 'Karachi', owner: 1, address: 'Khayaban-e-Shahbaz, DHA', desc: 'Smash burgers and loaded fries', menu: {
    Burgers: [['Zinger Burger', 650, 'Crispy chicken, lettuce, cheese'], ['Smash Beef Burger', 790, 'Double patty, house sauce']],
    Fries: [['Masala Fries', 290, 'Chaat masala dusted'], ['Cheese Loaded Fries', 420, 'Cheddar and jalapeno']],
    Wraps: [['Chicken Tikka Wrap', 480, 'Paratha wrap with raita'], ['Beef Kabab Wrap', 520, 'Seekh, onion, chutney']],
    Shakes: [['Oreo Shake', 420, 'Thick and cold'], ['Mango Shake', 380, 'Seasonal mango']],
    Deals: [['Burger Combo', 899, 'Burger, fries and drink'], ['Family Box', 2499, '4 burgers, 2 fries, 4 drinks']] } },
  { name: 'Pizza Piazza', city: 'Lahore', owner: 1, address: 'MM Alam Road, Gulberg', desc: 'Stone-baked pizza and fresh pasta', menu: {
    Pizza: [['Fajita Pizza', 1250, 'Chicken fajita, peppers, olives'], ['Margherita', 980, 'Mozzarella and basil']],
    Pasta: [['Creamy Alfredo', 890, 'Chicken and mushroom'], ['Penne Arrabbiata', 790, 'Spicy tomato sauce']],
    Starters: [['Garlic Bread', 350, 'Cheesy, oven fresh'], ['Chicken Wings', 620, 'Six pieces, hot glaze']],
    Desserts: [['Chocolate Lava Cake', 450, 'Warm centre'], ['Tiramisu', 520, 'Classic coffee dessert']],
    Drinks: [['Soft Drink', 120, '345 ml can'], ['Iced Tea', 220, 'Peach or lemon']] } },
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zaiqa_db');
  await Promise.all([User, Restaurant, Category, MenuItem, Cart, Order].map((m) => m.deleteMany({})));
  const h = (p) => bcrypt.hashSync(p, 12);
  await User.create([{ name: 'Zaiqa Super Admin', email: 'admin@zaiqa.pk', password: h('Admin@123'), phone: '+923000000000', role: 'admin' }]);
  const owners = await User.create([
    { name: 'Bilal Ahmed', email: 'owner1@zaiqa.pk', password: h('Owner@123'), phone: '+923001111111', role: 'restaurant_admin' },
    { name: 'Sara Khan', email: 'owner2@zaiqa.pk', password: h('Owner@123'), phone: '+923002222222', role: 'restaurant_admin' }]);
  await User.create([1, 2, 3].map((n) => ({ name: `Customer ${n}`, email: `customer${n}@zaiqa.pk`, password: h('Customer@123'), phone: `+92300333333${n}`, role: 'customer' })));
  let items = 0;
  for (const d of DATA) {
    const r = await Restaurant.create({ name: d.name, city: d.city, address: d.address, description: d.desc, owner: owners[d.owner].id, phone: '+923001234567', email: 'hello@zaiqa.pk', openingTime: '11:00', closingTime: '01:00' });
    let sort = 1;
    for (const [cat, list] of Object.entries(d.menu)) {
      const c = await Category.create({ restaurant: r.id, name: cat, sortOrder: sort++ });
      for (const [name, price, description] of list) {
        await MenuItem.create({ restaurant: r.id, category: c.id, name, price, description, preparationTime: 10 + Math.floor(Math.random() * 15) }); items++;
      }
    }
  }
  console.log(`Seeded 6 users, ${DATA.length} restaurants, ${items} menu items.\n\nLogins\n  admin@zaiqa.pk     Admin@123\n  owner1@zaiqa.pk    Owner@123  (Zaiqa Karahi House)\n  owner2@zaiqa.pk    Owner@123  (Burger Lab, Pizza Piazza)\n  customer1@zaiqa.pk Customer@123`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
