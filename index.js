const express = require("express");
const cors = require("cors");
const axios = require("axios");
const bcrypt = require("bcrypt");
const db = require("./db/init");
// const AlipaySdk = require('alipay-sdk').default;
// const AlipayFormData = require('alipay-sdk/lib/form').default;

const app = express();

app.use(cors());
app.use(express.json());

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
    const hashedPassword = await bcrypt.hash(password, 1);
    db.run(
      "INSERT INTO users (email, password, credits) VALUES (?, ?, ?)",
      [email, hashedPassword, 3],
      function (err) {
        if (err) {
          if (err.code === "SQLITE_CONSTRAINT") {
            return res.status(400).json({ error: "邮箱已被注册" });
          }
          return res.status(500).json({ error: "注册失败" });
        }
        res.json({
          id: this.lastID,
          email,
          credits: 3,
        });
      }
    );
  } catch (error) {
    res.status(500).json({ error: "服务器错误" });
  }
});

// 用户登录
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (err) return res.status(500).json({ error: "服务器错误" });
    if (!user) return res.status(401).json({ error: "用户不存在" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: "密码错误" });

    res.json({
      id: user.id,
      email: user.email,
      credits: user.credits,
    });
  });
});

// 获取用户的对话历史
app.get("/api/conversations/:userId", (req, res) => {
  const { userId } = req.params;
  db.all(
    `SELECT * FROM conversations WHERE user_id = ? ORDER BY created_at DESC`,
    [userId],
    (err, conversations) => {
      if (err) return res.status(500).json({ error: "获取历史记录失败" });

      // 转换数据格式以匹配前端期望的结构
      const formattedConversations = conversations.map((conv) => ({
        id: conv.id,
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
    }
  );
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
    console.log("Received userId:", userId); // 添加调试日志

    // 检查用户积分
    db.get("SELECT * FROM users WHERE id = ?", [userId], async (err, user) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: "数据库查询错误" });
      }
      if (!user) {
        console.log("User not found for id:", userId);
        return res.status(400).json({ error: `用户不存在 (ID: ${userId})` });
      }
      if (user.credits <= 0) {
        return res.status(400).json({ error: "积分不足" });
      }

      try {
        // const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
        //   model: "deepseek-chat",
        //   messages,
        //   max_tokens: 2000,
        //   temperature: 0.7,
        //   top_p: 0.9,
        //   presence_penalty: 0,
        //   frequency_penalty: 0,
        //   stream: false
        // }, {
        //   headers: {
        //     'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        //     'Content-Type': 'application/json',
        //     'Accept': 'application/json'
        //   }
        // });

        // const generatedContent = response.data.choices[0].message.content;
        const generatedContent =
          "结合男女演员的不同地域背景（男演员来自贵州，女演员来自山东）以及他们现在居住在成都的情况，可以进一步丰富视频的内容和层次感。以下是一些建议，既可以保持原有的幽默搞笑风格，又能增加更多元的文化交流元素：方向一：跨地域文化碰撞概念：通过展示两人日常生活中的互动，突出因地域差异带来的有趣对比和文化交流。 具体做法：场景设计：可以在视频中设置一些日常生活的场景，比如做饭、庆祝节日等，展示贵州和山东两地不同的习俗。对话设计：利用方言作为沟通工具，当一方用自己家乡的方言说话时，另一方表现出困惑或好奇，并尝试学习对方的语言。教育意义：每个视频都可以介绍一个小知识点，如某个方言词的意思、背后的习俗或者历史故事，让观众在欢笑中学到东西。方向二：探索成都生活概念：围绕他们在成都的生活经历，探讨如何将不同地方的习惯融入到新的城市生活中。具体做法：本地特色：介绍成都当地的美食、景点及文化活动，同时比较这些与贵州和山东的不同之处。适应过程：可以通过一系列短剧展现他们是如何逐步适应成都的生活方式，包括饮食习惯、社交礼仪等方面的变化。融合创新：鼓励他们创造性的结合三地文化的元素，例如尝试制作一道混合了贵州风味、山东口味以及成都特色的菜肴。方向三：语言学习之旅概念：以轻松愉快的方式教授观众学习贵州话和山东话，同时也能学到一些成都当地流行的表达方式。具体做法：教学环节：每期设定一个主题词汇或句子，先由贵州籍男演员教一句方言，再由山东籍女演员尝试模仿并解释其含义。实际应用：随后展示这句话在日常生活中的应用场景，可能是在市场买菜、与邻居聊天等情景下使用。挑战任务：每周安排一个小挑战，比如要求两人只用方言进行一天的交流，记录下过程中发生的趣事。无论选择哪个方向，关键在于保持内容的真实性和趣味性，确保观众能够从中获得价值。此外，考虑到成都近年来成为了女性游客最喜爱的目的地之一2，也可以考虑加入一些关于成都旅游文化的元素，吸引更多关注。通过持续优化内容质量和增强互动性，这样的自媒体项目有望吸引广泛的受众群体。";

        // 使用事务确保数据一致性
        db.serialize(() => {
          db.run("BEGIN TRANSACTION");

          // 保存对话历史
          db.run(
            `INSERT INTO conversations (user_id, product_name, selling_points, pain_points, generated_content)
               VALUES (?, ?, ?, ?, ?)`,
            [userId, productName, sellingPoints, painPoints, generatedContent]
          );

          // 更新用户积分
          db.run("UPDATE users SET credits = credits - 1 WHERE id = ?", [
            userId,
          ]);

          db.run("COMMIT");
        });

        // res.json(response.data);
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
        db.run("ROLLBACK");
        console.error("Generation error:", error);
        res.status(500).json({
          error: {
            message: error.response?.data?.error?.message || "生成失败",
          },
        });
      }
    });
  } catch (error) {
    console.error("Outer error:", error);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 删除对话历史
app.delete("/api/conversations/:id", (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  db.run(
    "DELETE FROM conversations WHERE id = ? AND user_id = ?",
    [id, userId],
    (err) => {
      if (err) return res.status(500).json({ error: "删除失败" });
      res.json({ message: "删除成功" });
    }
  );
});

// 获取用户信息（包括积分）
app.get("/api/users/:userId", (req, res) => {
  const { userId } = req.params;
  db.get(
    "SELECT id, email, credits FROM users WHERE id = ?",
    [userId],
    (err, user) => {
      if (err) return res.status(500).json({ error: "获取用户信息失败" });
      if (!user) return res.status(404).json({ error: "用户不存在" });
      res.json(user);
    }
  );
});

// 创建支付订单
app.post("/api/payment/create", async (req, res) => {
  const { userId, amount, credits } = req.body;
  try {
    // 生成订单号
    const orderId = `ORDER_${Date.now()}_${userId}`;
    
    // 保存订单信息到数据库
    db.run(
      `INSERT INTO orders (order_id, user_id, amount, credits, status)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, userId, amount, credits, "pending"]
    );

    // 返回个人微信收款码
    res.json({
      orderId,
      qrCode: "/images/wechat-payment-qr.jpg",  // 你的个人微信收款码图片
      tip: `请支付${amount}元，支付完成后点击确认按钮`
    });
  } catch (error) {
    console.error("Create payment error:", error);
    res.status(500).json({ error: "创建支付订单失败" });
  }
});

// 手动确认支付
app.post("/api/payment/confirm", async (req, res) => {
  const { orderId } = req.body;

  db.get(
    "SELECT * FROM orders WHERE order_id = ? AND status = 'pending'",
    [orderId],
    (err, order) => {
      if (err || !order) return res.status(500).json({ error: "订单不存在" });

      // 更新订单状态和用户积分
      db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run("UPDATE orders SET status = 'completed' WHERE order_id = ?", [
          orderId,
        ]);
        db.run("UPDATE users SET credits = credits + ? WHERE id = ?", [
          order.credits,
          order.user_id,
        ]);
        db.run("COMMIT");
      });

      res.json({ message: "支付成功" });
    }
  );
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
