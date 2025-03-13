const mongoose = require('mongoose');

// 添加这行来解决警告
mongoose.set('strictQuery', false);

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB 连接成功');
  } catch (error) {
    console.error('MongoDB 连接失败:', error.message);
    throw error;  // 修改这里，让错误继续向上传播
  }
};

// 用户模型
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  credits: { type: Number, default: 3 }
}, { timestamps: true });

// 对话历史模型
const conversationSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  product_name: { type: String, required: true },
  selling_points: String,
  pain_points: String,
  generated_content: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
}, { timestamps: true });

// 订单模型
const orderSchema = new mongoose.Schema({
  order_id: { type: String, required: true, unique: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  credits: { type: Number, required: true },
  status: { type: String, default: 'pending', enum: ['pending', 'completed', 'failed'] },
  created_at: { type: Date, default: Date.now }
}, { timestamps: true });

// 确保模型只被创建一次
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);
const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

module.exports = {
  connectDB,
  User,
  Conversation,
  Order
}; 