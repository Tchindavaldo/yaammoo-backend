# Infrastructure — Validation & Error Handling

## Rôle

Validation uniformisée des données entrantes, gestion erreurs cohérente, logging structuré.

---

## Validation Pattern

**Fichiers** : `src/utils/validator/`

Chaque domaine a son validateur :
- `validateUser.js` — registration, profile update
- `validateFastfood.js` — création/édition boutique
- `validateMenu.js` — création/édition menu
- `validateOrder.js` — création commande
- `validateBonus.js` — création/utilisation bonus
- etc.

### Structure validateur

```javascript
// validateUser.js
const validateUser = (data) => {
  const errors = [];
  
  if (!data.email || !data.email.includes('@')) {
    errors.push({ field: 'email', message: 'Email invalide' });
  }
  
  if (!data.password || data.password.length < 6) {
    errors.push({ field: 'password', message: 'Minimum 6 caractères' });
  }
  
  if (data.numero && isNaN(data.numero)) {
    errors.push({ field: 'numero', message: 'Doit être un nombre' });
  }
  
  return errors;  // [] si OK, sinon array d'erreurs
};

module.exports = { validateUser };
```

### Usage dans contrôleur

```javascript
const { validateUser } = require('../../utils/validator/validateUser');

exports.createUserController = async (req, res) => {
  const errors = validateUser(req.body);
  
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation échouée',
      errors  // [{field, message}, ...]
    });
  }
  
  try {
    // Service logic
    const result = await userService.createUser(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
```

---

## Error Handling Pattern

### Dans les contrôleurs

```javascript
try {
  const result = await someService.doSomething();
  res.status(200).json({ success: true, data: result });
} catch (error) {
  // Custom error code?
  const statusCode = error.code || 500;
  const message = error.message || 'Erreur serveur';
  
  console.error(`❌ [${controllerName}] ${message}`);
  
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
}
```

### Dans les services

```javascript
exports.createFastfood = async (data) => {
  const errors = validateFastfood(data);
  if (errors.length > 0) {
    const err = new Error(`Validation: ${errors.map(e => e.message).join(', ')}`);
    err.code = 400;
    throw err;
  }
  
  const existing = await repos.fastfoods.getByUserId(data.userId);
  if (existing) {
    const err = new Error('Cet utilisateur possède déjà une boutique');
    err.code = 400;
    throw err;
  }
  
  // OK, proceed
  const created = await repos.fastfoods.create(data);
  return created;
};
```

### Custom Error class (optionnel)

```javascript
// utils/errors/ApiError.js
class ApiError extends Error {
  constructor(message, code = 500) {
    super(message);
    this.code = code;
    this.name = 'ApiError';
  }
}

module.exports = ApiError;

// Usage
throw new ApiError('User non trouvé', 404);
```

---

## HTTP Status Codes

| Code | Usage | Example |
|------|-------|---------|
| 200 | Success GET/PUT | User récupéré |
| 201 | Success POST (created) | Menu créé |
| 204 | Success DELETE (no content) | Item supprimé |
| 400 | Bad request (validation) | Email invalide |
| 401 | Unauthorized (auth) | Token expiré |
| 403 | Forbidden (permission) | Pas marchand |
| 404 | Not found | User/Menu inexistant |
| 409 | Conflict (state) | Déjà utilisé, doublon |
| 422 | Unprocessable (business logic) | Stock insuffisant |
| 500 | Server error | Exception non gérée |

---

## Response Format

**Success** (200/201):
```json
{
  "success": true,
  "message": "Utilisateur créé",
  "data": { "id": "...", "email": "..." }
}
```

**Error** (400+):
```json
{
  "success": false,
  "error": "Email déjà utilisé",
  "errors": [  // Si validation
    { "field": "email", "message": "Déjà utilisé" }
  ]
}
```

---

## Logging Strategy

### Levels

```javascript
console.log('ℹ️  Info message');           // Info
console.warn('⚠️  Warning');              // Warning
console.error('❌ Error message');        // Error
```

### Structured logging (optionnel, futur)

```javascript
// Avec Pino ou Winston
logger.info({ userId, action: 'login', timestamp: new Date() });
logger.error({ error: err.message, stack: err.stack });
```

---

## Common validations

```javascript
// Email
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Phone (simple)
const isValidPhone = (phone) => /^\d{8,}$/.test(String(phone));

// URL
const isValidUrl = (url) => {
  try { new URL(url); return true; } catch { return false; }
};

// Date
const isValidDate = (dateString) => !isNaN(new Date(dateString).getTime());

// Montant
const isValidAmount = (amount) => amount > 0 && amount <= 999999999;
```

---

## Checklist validation

Avant chaque création/édition :

- [ ] Champs requis : présents et non-vides
- [ ] Types : string/number/boolean corrects
- [ ] Format : email, phone, URL, date
- [ ] Ranges : age >= 0, montant > 0, stock >= 0
- [ ] Unicité : pas de doublon (email, username, etc.)
- [ ] Références : IDs existants (userId, fastFoodId, etc.)
- [ ] Permission : user propriétaire ou admin

---

## Testing validations

```javascript
// test/validators.test.js
const { validateUser } = require('../src/utils/validator/validateUser');

describe('validateUser', () => {
  it('should accept valid user', () => {
    const errors = validateUser({ 
      email: 'test@example.com', 
      password: 'secure123' 
    });
    expect(errors.length).toBe(0);
  });
  
  it('should reject invalid email', () => {
    const errors = validateUser({ email: 'invalid', password: 'secure123' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('email');
  });
});
```
