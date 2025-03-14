require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const { connectDB, User, Conversation, Order } = require("./db/mongodb");
// const AlipaySdk = require('alipay-sdk').default;
// const AlipayFormData = require('alipay-sdk/lib/form').default;

const app = express();

app.use(cors());
app.use(express.json());

// 添加请求日志中间件
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// 修改数据库连接部分
(async () => {
  try {
    await connectDB();
    console.log("数据库连接成功，API 服务已就绪");
  } catch (error) {
    console.error("启动失败:", error);
    process.exit(1);
  }
})();

const DEEPSEEK_API_KEY = "sk-345155c614ee4f71bcf85bb94df2e1ce";

// 配置支付宝SDK
// const alipaySdk = new AlipaySdk({
//   appId: "your_app_id",
//   privateKey: "your_private_key",
//   gateway: "https://openapi.alipaydev.com/gateway.do", // 沙箱环境，生产环境需要改为正式地址
// });

// 用户注册
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "邮箱已被注册" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      email,
      password: hashedPassword,
      credits: 3,
    });

    const savedUser = await user.save();
    res.json({
      id: savedUser._id.toString(),
      email: savedUser.email,
      credits: savedUser.credits,
    });
  } catch (error) {
    console.error("注册失败:", error);
    res.status(500).json({ error: "注册失败: " + error.message });
  }
});

// 用户登录
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "用户不存在" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: "密码错误" });

    res.json({
      id: user._id.toString(),
      email: user.email,
      credits: user.credits,
    });
  } catch (error) {
    console.error("登录失败:", error);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 获取用户的对话历史
app.get("/api/conversations/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const conversations = await Conversation.find({ user_id: userId }).sort({
      created_at: -1,
    });

    const formattedConversations = conversations.map((conv) => ({
      id: conv._id.toString(),
      timestamp: conv.created_at,
      productName: conv.product_name,
      content: conv.generated_content,
      input: {
        productName: conv.product_name,
        sellingPoints: conv.selling_points,
        painPoints: conv.pain_points,
      },
    }));

    res.json(formattedConversations);
  } catch (error) {
    console.error("获取历史记录失败:", error);
    res.status(500).json({ error: "获取历史记录失败" });
  }
});

// 添加用户验证中间件
const validateUser = (req, res, next) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "缺少用户ID" });
  }
  next();
};

// AI生成内容
app.post("/api/generate", validateUser, async (req, res) => {
  const { userId, productName, sellingPoints, painPoints, messages } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(400).json({ error: `用户不存在 (ID: ${userId})` });
    }
    if (user.credits <= 0) {
      return res.status(400).json({ error: "积分不足" });
    }

    const response = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages,
        max_tokens: 2000,
        temperature: 0.7,
        top_p: 0.9,
        presence_penalty: 0,
        frequency_penalty: 0,
        stream: false,
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    const generatedContent = response.data.choices[0].message.content;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 保存对话历史
      const conversation = await Conversation.create(
        [
          {
            user_id: userId,
            product_name: productName,
            selling_points: sellingPoints,
            pain_points: painPoints,
            generated_content: generatedContent,
          },
        ],
        { session }
      );

      // 更新用户积分
      await User.findByIdAndUpdate(
        userId,
        { $inc: { credits: -1 } },
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      res.json({
        choices: [
          {
            message: {
              content: generatedContent,
            },
          },
        ],
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    console.error("Generation error:", error);
    res.status(500).json({ error: "生成失败: " + error.message });
  }
});

// 删除对话历史
app.delete("/api/conversations/:id", async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  try {
    await Conversation.findOneAndDelete({ _id: id, user_id: userId });
    res.json({ message: "删除成功" });
  } catch (error) {
    res.status(500).json({ error: "删除失败" });
  }
});

// 获取用户信息
app.get("/api/users/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findById(userId).select("email credits");
    if (!user) return res.status(404).json({ error: "用户不存在" });
    res.json({
      id: user._id.toString(),
      email: user.email,
      credits: user.credits,
    });
  } catch (error) {
    console.error("获取用户信息失败:", error);
    res.status(500).json({ error: "获取用户信息失败" });
  }
});

// 创建支付订单
app.post("/api/payment/create", async (req, res) => {
  const { userId, amount, credits } = req.body;
  try {
    const orderId = `ORDER_${Date.now()}_${userId}`;

    await Order.create({
      order_id: orderId,
      user_id: userId,
      amount,
      credits,
      status: "pending",
    });

    res.json({
      orderId,
      qrCode: "/images/wechat-payment-qr.jpg",
      tip: `请支付${amount}元，支付完成后点击确认按钮`,
    });
  } catch (error) {
    console.error("Create payment error:", error);
    res.status(500).json({ error: "创建支付订单失败" });
  }
});

// 手动确认支付
app.post("/api/payment/confirm", async (req, res) => {
  const { orderId } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findOne({ order_id: orderId, status: "pending" });
    if (!order) {
      return res.status(500).json({ error: "订单不存在" });
    }

    await Order.findByIdAndUpdate(
      order._id,
      { status: "completed" },
      { session }
    );

    await User.findByIdAndUpdate(
      order.user_id,
      { $inc: { credits: order.credits } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.json({ message: "支付成功" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ error: "支付确认失败" });
  }
});

// 添加测试接口
app.get("/api/test", (req, res) => {
  res.json({ message: "API 服务正常" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});

module.exports = app;
