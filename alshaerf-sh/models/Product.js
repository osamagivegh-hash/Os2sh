const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: [true, 'اسم المنتج مطلوب'],
        trim: true
    },
    price: { 
        type: Number, 
        required: [true, 'السعر مطلوب'],
        min: [0, 'السعر لا يمكن أن يكون سالباً']
    },
    quantity: { 
        type: Number, 
        required: [true, 'الكمية مطلوبة'],
        min: [0, 'الكمية لا يمكن أن تكون سالبة']
    },
    description: { 
        type: String, 
        required: [true, 'الوصف مطلوب'],
        trim: true
    },
    type: { 
        type: String, 
        default: 'تمور',
        trim: true
    },
    quality: { 
        type: String, 
        default: 'ممتاز',
        trim: true
    }
}, { 
    timestamps: true 
});

module.exports = mongoose.model('Product', productSchema);