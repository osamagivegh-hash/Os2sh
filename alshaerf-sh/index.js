const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// نماذج البيانات
const News = require('./models/News');
const User = require('./models/User');
const Comment = require('./models/Comment');

const app = express();

// 🔧 إعدادات مهمة لـ Render
const isProduction = process.env.NODE_ENV === 'production';
const port = process.env.PORT || 10000;

// إنشاء مجلد views إذا لم يكن موجوداً
const viewsDir = path.join(__dirname, 'views');
if (!fs.existsSync(viewsDir)) {
  console.log('📁 Creating views directory...');
  fs.mkdirSync(viewsDir, { recursive: true });
}

// 🔥 يجب أن يكون إعداد view engine في البداية قبل أي routes
app.set('view engine', 'ejs');
app.set('views', viewsDir);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// 🔧 إعداد الجلسات (بدون connect-mongo)
app.use(session({
  secret: process.env.SESSION_SECRET || 'familysecret',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24 // 24 ساعة
  }
}));

// Multer لتخزين الصور
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'public/uploads/';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'image-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('يجب أن يكون الملف صورة!'), false);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ----- MongoDB -----
const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      console.error('❌ MONGO_URI غير مضبوط في البيئة');
      return false;
    }

    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB متصل بنجاح');
    return true;
  } catch (err) {
    console.error('❌ خطأ في الاتصال بMongoDB:', err.message);
    return false;
  }
};

// التحقق من اتصال قاعدة البيانات
const checkDatabaseConnection = async () => {
  try {
    const connectionState = mongoose.connection.readyState;
    const statusMap = {
      0: 'منفصل',
      1: 'متصل',
      2: 'جاري الاتصال',
      3: 'جاري الفصل'
    };
    
    console.log(`📊 حالة اتصال MongoDB: ${statusMap[connectionState] || 'غير معروف'} (${connectionState})`);
    
    if (connectionState !== 1) {
      return false;
    }
    
    // التحقق من وجود بيانات
    const usersCount = await User.countDocuments();
    const newsCount = await News.countDocuments();
    
    console.log(`👤 عدد المستخدمين: ${usersCount}`);
    console.log(`📰 عدد الأخبار: ${newsCount}`);
    
    return true;
  } catch (error) {
    console.error('❌ خطأ في التحقق من اتصال قاعدة البيانات:', error.message);
    return false;
  }
};

// إنشاء مستخدم مسؤول افتراضي إذا لم يكن موجوداً
const createDefaultAdmin = async () => {
  try {
    const existingAdmin = await User.findOne({ email: 'admin@example.com' });
    
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const adminUser = new User({
        name: 'مدير النظام',
        email: 'admin@example.com',
        password: hashedPassword,
        isAdmin: true
      });
      
      await adminUser.save();
      console.log('✅ تم إنشاء مستخدم مسؤول افتراضي');
      console.log('📧 البريد الإلكتروني: admin@example.com');
      console.log('🔑 كلمة المرور: admin123');
    } else {
      console.log('✅ المستخدم المسؤول موجود بالفعل');
    }
  } catch (error) {
    console.error('❌ خطأ في إنشاء المستخدم الافتراضي:', error.message);
  }
};

// ----- Admin Authentication -----
function isAdmin(req, res, next) {
  if (req.session && (req.session.admin || (req.session.user && req.session.user.isAdmin))) {
    return next();
  }
  return res.redirect('/admin/login');
}

// ----- Routes -----
// Admin login
app.get('/admin/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>لوحة التحكم - تسجيل الدخول</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
            body { background: linear-gradient(135deg, #1a202c 0%, #2d3748 100%); color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
            .login-container { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 40px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3); width: 100%; max-width: 400px; }
            .header { text-align: center; margin-bottom: 30px; }
            h1 { color: #fff; margin-bottom: 10px; font-size: 2rem; }
            .subtitle { color: #a0aec0; margin-bottom: 30px; }
            .form-group { margin-bottom: 20px; }
            label { display: block; margin-bottom: 8px; color: #e2e8f0; font-weight: 600; }
            input { width: 100%; padding: 15px; background: rgba(255, 255, 255, 0.1); border: 2px solid rgba(255, 255, 255, 0.2); border-radius: 10px; font-size: 1rem; color: #fff; transition: border-color 0.3s ease; }
            input:focus { outline: none; border-color: #63b3ed; }
            input::placeholder { color: #a0aec0; }
            button { width: 100%; background: #63b3ed; color: #1a202c; padding: 15px; border: none; border-radius: 10px; font-size: 1.1rem; font-weight: 600; cursor: pointer; transition: background 0.3s ease; }
            button:hover { background: #4299e1; }
            .back-link { display: block; text-align: center; margin-top: 25px; color: #a0aec0; }
            .back-link a { color: #63b3ed; text-decoration: none; }
            .back-link a:hover { text-decoration: underline; }
            .error { color: #fc8181; text-align: center; margin-bottom: 15px; }
            .db-status { 
                padding: 10px; 
                margin-bottom: 15px; 
                border-radius: 5px; 
                text-align: center;
                font-weight: bold;
            }
            .db-connected { background: #48bb78; color: white; }
            .db-disconnected { background: #e53e3e; color: white; }
            @media (max-width: 480px) { .login-container { padding: 30px 20px; } h1 { font-size: 1.7rem; } }
        </style>
    </head>
    <body>
        <div class="login-container">
            <div class="header">
                <h1>لوحة التحكم</h1>
                <p class="subtitle">تسجيل الدخول للإدارة</p>
            </div>
            
            <div class="db-status ${mongoose.connection.readyState === 1 ? 'db-connected' : 'db-disconnected'}">
                ${mongoose.connection.readyState === 1 ? '✅ قاعدة البيانات متصلة' : '❌ قاعدة البيانات غير متصلة'}
            </div>
            
            <form action="/admin/login" method="POST">
                <div class="form-group">
                    <label for="email">البريد الإلكتروني</label>
                    <input type="email" id="email" name="email" placeholder="أدخل البريد الإلكتروني" required>
                </div>
                
                <div class="form-group">
                    <label for="password">كلمة المرور</label>
                    <input type="password" id="password" name="password" placeholder="أدخل كلمة المرور" required>
                </div>
                
                <button type="submit">تسجيل الدخول</button>
            </form>
            
            <div class="back-link">
                <a href="/">← العودة إلى الموقع الرئيسي</a>
            </div>
            
            <div style="margin-top: 20px; padding: 15px; background: rgba(255, 255, 255, 0.1); border-radius: 10px;">
                <p style="margin: 0; font-size: 0.9rem; color: #a0aec0; text-align: center;">
                    🔐 بيانات تسجيل الدخول الافتراضية:<br>
                    البريد: admin@example.com<br>
                    كلمة المرور: admin123
                </p>
            </div>
        </div>
    </body>
    </html>
  `);
});

app.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // التحقق من اتصال قاعدة البيانات أولاً
    if (mongoose.connection.readyState !== 1) {
      return res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>خطأ في الاتصال</title>
            <style>
                body { font-family: Arial; padding: 50px; text-align: center; background: #f8f9fa; }
                .error { color: #e53e3e; margin-bottom: 20px; font-size: 1.2rem; }
                .info { color: #4a5568; margin-bottom: 30px; }
            </style>
        </head>
        <body>
            <div class="error">❌ قاعدة البيانات غير متصلة</div>
            <div class="info">يجب الاتصال بقاعدة البيانات أولاً لتسجيل الدخول</div>
            <a href="/admin/login">العودة إلى صفحة التسجيل</a>
        </body>
        </html>
      `);
    }
    
    // البحث عن المستخدم في قاعدة البيانات
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>خطأ في التسجيل</title>
            <style>body { font-family: Arial; padding: 50px; text-align: center; } .error { color: red; }</style>
        </head>
        <body>
            <div class="error">المستخدم غير موجود</div>
            <a href="/admin/login">العودة إلى صفحة التسجيل</a>
        </body>
        </html>
      `);
    }

    // التحقق من كلمة المرور
    const match = await bcrypt.compare(password, user.password);
    
    if (match) {
      // حفظ معلومات المستخدم في الجلسة
      req.session.user = user;
      req.session.admin = user.isAdmin;
      
      return res.redirect('/admin');
    }
    
    res.send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>خطأ في التسجيل</title>
          <style>body { font-family: Arial; padding: 50px; text-align: center; } .error { color: red; }</style>
      </head>
      <body>
          <div class="error">كلمة المرور خاطئة</div>
          <a href="/admin/login">العودة إلى صفحة التسجيل</a>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('خطأ في تسجيل الدخول');
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.redirect('/');
  });
});

// Route للتحقق من حالة الاتصال بقاعدة البيانات
app.get('/health', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState;
    const statusMap = {
      0: 'منفصل',
      1: 'متصل',
      2: 'جاري الاتصال',
      3: 'جاري الفصل'
    };
    
    const usersCount = await User.countDocuments();
    const newsCount = await News.countDocuments();
    
    res.json({
      status: 'success',
      database: {
        connection: statusMap[dbStatus] || 'غير معروف',
        readyState: dbStatus,
        usersCount: usersCount,
        newsCount: newsCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Route لعرض معلومات الاتصال
app.get('/debug', async (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const statusMap = {
    0: 'منفصل',
    1: 'متصل',
    2: 'جاري الاتصال',
    3: 'جاري الفصل'
  };
  
  res.send(`
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>معلومات التصحيح</title>
        <style>
            body { font-family: Arial; padding: 20px; }
            .card { background: #f8f9fa; padding: 20px; margin: 10px 0; border-radius: 5px; }
            .success { background: #d4edda; color: #155724; }
            .warning { background: #fff3cd; color: #856404; }
            .danger { background: #f8d7da; color: #721c24; }
        </style>
    </head>
    <body>
        <h1>معلومات التصحيح</h1>
        
        <div class="card ${dbStatus === 1 ? 'success' : 'danger'}">
            <h2>حالة قاعدة البيانات</h2>
            <p>الحالة: ${statusMap[dbStatus] || 'غير معروف'} (${dbStatus})</p>
            <p>MONGO_URI: ${process.env.MONGO_URI ? 'مضبوط' : 'غير مضبوط'}</p>
        </div>
        
        <div class="card">
            <h2>إعدادات الخادم</h2>
            <p>المنفذ: ${port}</p>
            <p>الوضع: ${isProduction ? 'إنتاج' : 'تطوير'}</p>
        </div>
        
        <div class="card">
            <h2>إجراءات التصحيح</h2>
            <p><a href="/health">التحقق من صحة الاتصال (JSON)</a></p>
            <p><a href="/admin/login">صفحة تسجيل الدخول للإدارة</a></p>
        </div>
    </body>
    </html>
  `);
});

// الباقي من الروتس والإعدادات تبقى كما هي (مثل admin panel, customer routes, etc.)
// ... [يجب إضافة جميع الروتس الأخرى هنا كما كانت في الإصدار السابق]

// 🔧 تشغيل الخادم مع معالجة الأخطاء
const startServer = async () => {
  try {
    // الاتصال بقاعدة البيانات
    const dbConnected = await connectDB();
    
    if (dbConnected) {
      // التحقق من اتصال قاعدة البيانات
      await checkDatabaseConnection();
      
      // إنشاء مستخدم افتراضي إذا لزم الأمر
      await createDefaultAdmin();
    } else {
      console.log('⚠️  تم بدء التشغيل بدون اتصال بقاعدة البيانات');
    }
    
    // استمع على المنفذ الصحيح
    app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${port}`);
      console.log(`🌐 Available: http://localhost:${port}`);
      if (isProduction) {
        console.log('✅ Running in production mode');
      } else {
        console.log('🔧 Running in development mode');
      }
      
      // رسالة توضيحية للمستخدم
      console.log('\n📋 معلومات تسجيل الدخول:');
      console.log('لوحة التحكم: /admin/login');
      console.log('البريد الإلكتروني: admin@example.com');
      console.log('كلمة المرور: admin123');
      console.log('صفحة التصحيح: /debug');
      console.log('صفحة صحة الاتصال: /health');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// 🔧 معالج الأخطاء غير المتوقعة
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
  process.exit(1);
});

// ابدأ تشغيل الخادم
startServer();