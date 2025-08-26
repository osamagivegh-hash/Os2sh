const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// استبدال نموذج المنتج بنموذج الأخبار
const News = require('./models/News');
const User = require('./models/User');
const Comment = require('./models/Comment');

const app = express();

// التحقق من وجود ملفات القوالب
const templatePath = path.join(__dirname, 'templates');
const requiredTemplates = ['admin.ejs', 'admin-edit.ejs', 'overview.ejs', 'news.ejs', 'admin-login.ejs'];

console.log('📁 Checking template files...');
requiredTemplates.forEach(template => {
  const filePath = path.join(templatePath, template);
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${template} - موجود`);
  } else {
    console.log(`❌ ${template} - غير موجود`);
  }
});

// إعداد محرك القوالب EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'familysecret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// تكوين multer لتخزين الصور
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // تأكد من وجود مجلد التحميلات
    const uploadDir = 'public/uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // إنشاء اسم فريد للصورة
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'image-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    // قبول الصور فقط
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('يجب أن يكون الملف صورة!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB كحد أقصى
  }
});

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/family-site', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ----- Admin Authentication -----
function isAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.redirect('/admin/login');
}

// ----- Routes -----

// Admin login page
app.get('/admin/login', (req, res) => {
  res.render('admin-login');
});

app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if(username === 'admin' && password === 'admin123'){
      req.session.admin = true;
      return res.redirect('/admin');
    }
    res.send('Invalid credentials');
  } catch (error) {
    console.error('Error in admin login:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Admin logout
app.get('/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/');
  });
});

// Admin panel - عرض الأخبار
app.get('/admin', isAdmin, async (req, res) => {
  try {
    const news = await News.find().sort({ createdAt: -1 });
    
    // التحقق من وجود القالب
    const templatePath = path.join(__dirname, 'templates', 'admin.ejs');
    if (!fs.existsSync(templatePath)) {
      console.error('❌ Template not found:', templatePath);
      return res.status(500).send('قالب لوحة التحكم غير موجود');
    }
    
    res.render('admin', { news });
  } catch (error) {
    console.error('Error in admin panel:', error);
    res.status(500).send('Internal Server Error: ' + error.message);
  }
});
// Add new news
app.post('/admin/add-news', isAdmin, upload.single('image'), async (req, res) => {
  try {
    // تحويل قيمة isPublished إلى Boolean
    const newsData = {
      ...req.body,
      isPublished: req.body.isPublished === 'on'
    };
    
    // إذا تم رفع صورة، أضف مسارها
    if (req.file) {
      newsData.imageUrl = '/uploads/' + req.file.filename;
    }
    
    const newsItem = new News(newsData);
    await newsItem.save();
    res.redirect('/admin');
  } catch (error) {
    console.error('Error adding news:', error);
    res.status(500).send('Error adding news');
  }
});

// Edit news form
app.get('/admin/edit-news/:id', isAdmin, async (req, res) => {
  try {
    const newsItem = await News.findById(req.params.id);
    if (!newsItem) {
      return res.status(404).send('News not found');
    }
    res.render('admin-edit', { newsItem });
  } catch (error) {
    console.error('Error editing news:', error);
    res.status(500).send('Error loading edit form');
  }
});

// Update news
app.post('/admin/edit-news/:id', isAdmin, upload.single('image'), async (req, res) => {
  try {
    // تحويل قيمة isPublished إلى Boolean
    const updateData = {
      ...req.body,
      isPublished: req.body.isPublished === 'on'
    };
    
    // إذا تم رفع صورة جديدة، أضف مسارها
    if (req.file) {
      updateData.imageUrl = '/uploads/' + req.file.filename;
      
      // (اختياري) حذف الصورة القديمة إذا كانت موجودة
      const oldNews = await News.findById(req.params.id);
      if (oldNews.imageUrl && oldNews.imageUrl.startsWith('/uploads/')) {
        const oldImagePath = path.join(__dirname, 'public', oldNews.imageUrl);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
    }
    
    // إذا طلب المستخدم حذف الصورة
    if (req.body.removeImage === 'true') {
      const oldNews = await News.findById(req.params.id);
      if (oldNews.imageUrl && oldNews.imageUrl.startsWith('/uploads/')) {
        const oldImagePath = path.join(__dirname, 'public', oldNews.imageUrl);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      updateData.imageUrl = '';
    }
    
    await News.findByIdAndUpdate(req.params.id, updateData);
    res.redirect('/admin');
  } catch (error) {
    console.error('Error updating news:', error);
    res.status(500).send('Error updating news');
  }
});

// Delete news
app.post('/admin/delete-news/:id', isAdmin, async (req, res) => {
  try {
    const newsItem = await News.findById(req.params.id);
    
    // حذف الصورة المرتبطة إذا كانت موجودة
    if (newsItem.imageUrl && newsItem.imageUrl.startsWith('/uploads/')) {
      const imagePath = path.join(__dirname, 'public', newsItem.imageUrl);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    await News.findByIdAndDelete(req.params.id);
    res.redirect('/admin');
  } catch (error) {
    console.error('Error deleting news:', error);
    res.status(500).send('Error deleting news');
  }
});

// ----- Customer routes -----

// Register page
app.get('/register', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>تسجيل مستخدم جديد</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light">
      <div class="container py-5">
        <div class="row justify-content-center">
          <div class="col-md-6">
            <div class="card shadow">
              <div class="card-body p-5">
                <h1 class="text-center mb-4">تسجيل مستخدم جديد</h1>
                <form method="POST" action="/register">
                  <div class="mb-3">
                    <label class="form-label">الاسم:</label>
                    <input type="text" name="name" class="form-control" required>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">البريد الإلكتروني:</label>
                    <input type="email" name="email" class="form-control" required>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">كلمة المرور:</label>
                    <input type="password" name="password" class="form-control" required>
                  </div>
                  <button type="submit" class="btn btn-primary w-100">تسجيل</button>
                </form>
                <div class="text-center mt-3">
                  <p><a href="/login">لديك حساب؟ سجل الدخول</a></p>
                  <p><a href="/">العودة للرئيسية</a></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Register
app.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.send('البريد الإلكتروني مسجل مسبقاً');
    }
    
    const hash = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hash });
    await user.save();
    res.redirect('/login');
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).send('خطأ في تسجيل المستخدم');
  }
});

// Login page
app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>تسجيل الدخول</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light">
      <div class="container py-5">
        <div class="row justify-content-center">
          <div class="col-md-6">
            <div class="card shadow">
              <div class="card-body p-5">
                <h1 class="text-center mb-4">تسجيل الدخول</h1>
                <form method="POST" action="/login">
                  <div class="mb-3">
                    <label class="form-label">البريد الإلكتروني:</label>
                    <input type="email" name="email" class="form-control" required>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">كلمة المرور:</label>
                    <input type="password" name="password" class="form-control" required>
                  </div>
                  <button type="submit" class="btn btn-primary w-100">تسجيل الدخول</button>
                </form>
                <div class="text-center mt-3">
                  <p><a href="/register">ليس لديك حساب؟ سجل الآن</a></p>
                  <p><a href="/">العودة للرئيسية</a></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Login
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if(!user) return res.send('المستخدم غير موجود');
    
    const match = await bcrypt.compare(password, user.password);
    if(match){
      req.session.user = user;
      return res.redirect('/');
    }
    res.send('كلمة المرور خاطئة');
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).send('خطأ في تسجيل الدخول');
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/');
  });
});

// Overview page - عرض الأخبار
app.get('/', async (req, res) => {
  try {
    const news = await News.find({ isPublished: true }).sort({ createdAt: -1 });
    
    let html = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>موقع العائلة - الرئيسية</title>
      <!-- Bootstrap CSS -->
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
      <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css" rel="stylesheet">
      <style>
        .hero-section {
          background: linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url('https://images.unsplash.com/photo-1549056572-75914d6d7e1a?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80');
          background-size: cover;
          background-position: center;
          color: white;
          padding: 100px 0;
          text-align: center;
        }
        .news-card {
          transition: transform 0.3s ease;
          border: none;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .news-card:hover {
          transform: translateY(-5px);
        }
        .navbar-custom {
          background-color: #4e73df !important;
        }
        .news-image {
          height: 200px;
          object-fit: cover;
        }
      </style>
    </head>
    <body>
      <!-- Navigation -->
      <nav class="navbar navbar-expand-lg navbar-dark navbar-custom">
        <div class="container">
          <a class="navbar-brand" href="/">
            <i class="bi bi-house-heart-fill"></i> موقع العائلة
          </a>
          <div class="navbar-nav ms-auto">
            ${req.session.user ? `
              <span class="navbar-text me-3">مرحباً, ${req.session.user.name || 'المستخدم'}</span>
              <a class="nav-link" href="/logout">تسجيل الخروج</a>
            ` : `
              <a class="nav-link" href="/login">تسجيل الدخول</a>
              <a class="nav-link" href="/register">تسجيل</a>
            `}
          </div>
        </div>
      </nav>

      <!-- Hero Section -->
      <section class="hero-section">
        <div class="container">
          <h1 class="display-4 fw-bold">مرحباً بكم في موقع عائلة الشاعر </h1>
          <p class="lead">مكاننا الخاص لمشاركة الأخبار والذكريات </p>
        </div>
      </section>

      <!-- News Section -->
      <section class="container my-5">
        <h2 class="text-center mb-4">أخبار العائلة</h2>
        
        <div class="row">
    `;
    
    if (news && news.length > 0) {
      news.forEach(newsItem => {
        const newsTitle = newsItem.title || 'خبر بدون عنوان';
        const newsContent = newsItem.content ? 
          (newsItem.content.length > 150 ? newsItem.content.substring(0, 150) + '...' : newsItem.content) 
          : 'لا يوجد محتوى';
        const newsDate = newsItem.createdAt ? new Date(newsItem.createdAt).toLocaleDateString('ar-SA') : 'تاريخ غير معروف';
        const newsImage = newsItem.imageUrl || 'https://images.unsplash.com/photo-1549056572-75914d6d7e1a?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80';
        
        html += `
          <div class="col-md-4 mb-4">
            <div class="card news-card h-100">
              <img src="${newsImage}" class="card-img-top news-image" alt="${newsTitle}">
              <div class="card-body">
                <h5 class="card-title">${newsTitle}</h5>
                <p class="card-text">${newsContent}</p>
                <div class="d-flex justify-content-between align-items-center">
                  <small class="text-muted">${newsDate}</small>
                  <a href="/news/${newsItem._id}" class="btn btn-primary btn-sm">
                    <i class="bi bi-eye"></i> قراءة المزيد
                  </a>
                </div>
              </div>
            </div>
          </div>
        `;
      });
    } else {
      html += `
        <div class="col-12">
          <div class="alert alert-info text-center">
            <i class="bi bi-info-circle"></i> لا توجد أخبار متاحة حالياً
          </div>
        </div>
      `;
    }
    
    html += `
        </div>
      </section>

      <!-- Footer -->
      <footer class="bg-dark text-white py-4 mt-5">
        <div class="container text-center">
          <p>&copy; 2025 موقع العائلة. جميع الحقوق محفوظة.</p>
          <div>
            <a href="/about" class="text-white me-3">عن الموقع</a>
            <a href="/contact" class="text-white">اتصل بنا</a>
          </div>
        </div>
      </footer>

      <!-- Bootstrap JS -->
      <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    </body>
    </html>
    `;
    
    res.send(html);
    
  } catch (error) {
    console.error('Error loading overview:', error);
    res.status(500).send('خطأ في تحميل الصفحة');
  }
});

// News details - تفاصيل الخبر
app.get('/news/:id', async (req, res) => {
  try {
    const newsItem = await News.findById(req.params.id);
    if (!newsItem) {
      return res.status(404).send('الخبر غير موجود');
    }
    
    const comments = await Comment.find({ news: req.params.id }).populate('user');
    
    // إصلاح مشكلة undefined للخبر
    const newsTitle = newsItem.title || 'خبر بدون عنوان';
    const newsContent = newsItem.content || 'لا يوجد محتوى';
    const newsDate = newsItem.createdAt ? new Date(newsItem.createdAt).toLocaleDateString('ar-SA') : 'تاريخ غير معروف';
    const newsImage = newsItem.imageUrl || 'https://images.unsplash.com/photo-1549056572-75914d6d7e1a?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80';
    const newsAuthor = newsItem.author || 'مجهول';
    
    let html = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${newsTitle} - تفاصيل الخبر</title>
      <!-- Bootstrap CSS -->
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
      <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css" rel="stylesheet">
      <style>
        .news-image {
          max-width: 100%;
          height: 400px;
          object-fit: cover;
          border-radius: 10px;
        }
      </style>
    </head>
    <body>
      <!-- Navigation -->
      <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
        <div class="container">
          <a class="navbar-brand" href="/">
            <i class="bi bi-arrow-left"></i> العودة للرئيسية
          </a>
          ${req.session.user ? `
            <span class="navbar-text">مرحباً, ${req.session.user.name || 'المستخدم'}</span>
          ` : ''}
        </div>
      </nav>

      <div class="container my-5">
        <div class="row">
          <!-- News Image -->
          <div class="col-md-12 mb-4">
            <img src="${newsImage}" 
                 alt="${newsTitle}" class="news-image img-fluid w-100">
          </div>
          
          <!-- News Details -->
          <div class="col-md-12">
            <h1 class="mb-3">${newsTitle}</h1>
            <div class="d-flex justify-content-between align-items-center mb-4">
              <span class="text-muted">نشر في: ${newsDate}</span>
              <span class="badge bg-primary">${newsAuthor}</span>
            </div>
            
            <div class="news-content mb-5">
              ${newsContent.split('\n').map(paragraph => `<p>${paragraph}</p>`).join('')}
            </div>
          </div>
        </div>

        <!-- Comments Section -->
        <div class="row mt-5">
          <div class="col-12">
            <h3><i class="bi bi-chat-dots"></i> التعليقات</h3>
            
            ${comments && comments.length > 0 ? comments.map(comment => `
              <div class="card mb-3">
                <div class="card-body">
                  <div class="d-flex justify-content-between">
                    <h6 class="card-title">${comment.user?.name || 'مستخدم'}</h6>
                    ${comment.rating ? `
                      <span class="text-warning">
                        ${'★'.repeat(comment.rating)}${'☆'.repeat(5 - comment.rating)}
                      </span>
                    ` : ''}
                  </div>
                  <p class="card-text">${comment.text}</p>
                  <small class="text-muted">${new Date(comment.createdAt).toLocaleString('ar-SA')}</small>
                </div>
              </div>
            `).join('') : `
              <div class="alert alert-info">
                <i class="bi bi-info-circle"></i> لا توجد تعليقات بعد
              </div>
            `}

            ${req.session.user ? `
              <div class="card mt-4">
                <div class="card-body">
                  <h5 class="card-title">أضف تعليقاً</h5>
                  <form method="POST" action="/news/${newsItem._id}/comment">
                    <div class="mb-3">
                      <label class="form-label">التعليق</label>
                      <textarea name="text" class="form-control" rows="3" required></textarea>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">التقييم (اختياري)</label>
                      <select name="rating" class="form-select">
                        <option value="">اختر التقييم</option>
                        <option value="5">⭐⭐⭐⭐⭐ (5 نجوم)</option>
                        <option value="4">⭐⭐⭐⭐ (4 نجوم)</option>
                        <option value="3">⭐⭐⭐ (3 نجوم)</option>
                        <option value="2">⭐⭐ (2 نجوم)</option>
                        <option value="1">⭐ (1 نجمة)</option>
                      </select>
                    </div>
                    <button type="submit" class="btn btn-primary">
                      <i class="bi bi-send"></i> إرسال التعليق
                    </button>
                  </form>
                </div>
              </div>
            ` : `
              <div class="alert alert-warning">
                <i class="bi bi-exclamation-triangle"></i> 
                <a href="/login" class="alert-link">سجل الدخول</a> لإضافة تعليق
              </div>
            `}
          </div>
        </div>
      </div>

      <!-- Bootstrap JS -->
      <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    </body>
    </html>
    `;
    
    res.send(html);
    
  } catch (error) {
    console.error('Error loading news:', error);
    res.status(500).send('خطأ في تحميل الخبر');
  }
});

// Add comment to news
app.post('/news/:id/comment', async (req, res) => {
  try {
    if(!req.session.user) return res.send('يجب تسجيل الدخول لإضافة تعليق');
    
    const comment = new Comment({
      news: req.params.id,
      user: req.session.user._id,
      text: req.body.text,
      rating: req.body.rating || 0
    });
    
    await comment.save();
    res.redirect(`/news/${req.params.id}`);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).send('خطأ في إضافة التعليق');
  }
});

// About page
app.get('/about', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>عن الموقع</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body>
      <nav class="navbar navbar-dark bg-dark">
        <div class="container">
          <a class="navbar-brand" href="/">العودة للرئيسية</a>
        </div>
      </nav>
      <div class="container my-5">
        <div class="row">
          <div class="col-md-8 mx-auto">
            <h1 class="text-center mb-4">عن موقع العائلة</h1>
            <p class="lead">هذا الموقع مخصص لعائلتنا الكريمة اخبار ومناسبات ومقالات وغيرها .</p>
            <p>نحن عائلة متماسكة نحب مشاركة لحظاتنا السعيدة مع بعضنا البعض.</p>
            <a href="/" class="btn btn-primary">العودة للرئيسية</a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Contact page
app.get('/contact', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>اتصل بنا</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body>
      <nav class="navbar navbar-dark bg-dark">
        <div class="container">
          <a class="navbar-brand" href="/">العودة للرئيسية</a>
        </div>
      </nav>
      <div class="container my-5">
        <div class="row">
          <div class="col-md-6 mx-auto">
            <h1 class="text-center mb-4">اتصل بنا</h1>
            <div class="card">
              <div class="card-body">
                <h5 class="card-title">معلومات الاتصال</h5>
                <p><strong>الهاتف:</strong> 0551234567</p>
                <p><strong>البريد الإلكتروني:</strong> info@family-site.com</p>
                <p><strong>العنوان:</strong> الرياض، المملكة العربية السعودية</p>
              </div>
            </div>
            <a href="/" class="btn btn-primary mt-3">العودة للرئيسية</a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// 404 handler
app.use((req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>الصفحة غير موجودة</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body>
      <div class="container text-center py-5">
        <h1 class="display-1">404</h1>
        <h2>الصفحة غير موجودة</h2>
        <p>عذراً، الصفحة التي تبحث عنها غير موجودة.</p>
        <a href="/" class="btn btn-primary">العودة للرئيسية</a>
      </div>
    </body>
    </html>
  `);
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>خطأ في الخادم</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body>
      <div class="container text-center py-5">
        <h1 class="display-1">500</h1>
        <h2>حدث خطأ في الخادم</h2>
        <p>عذراً، حدث خطأ غير متوقع. الرجاء المحاولة لاحقاً.</p>
        <a href="/" class="btn btn-primary">العودة للرئيسية</a>
      </div>
    </body>
    </html>
  `);
});

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Views directory: ${path.join(__dirname, 'templates')}`);
  console.log(`🔑 Admin login: http://localhost:${PORT}/admin/login`);
  console.log(`👤 User login: http://localhost:${PORT}/login`);
  console.log(`📸 Image uploads: http://localhost:${PORT}/uploads/`);
});