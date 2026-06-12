const cacheManager = require('../../cache/cacheManager');
const { CACHE_KEYS } = require('../../cache/cacheKeys');

class SceneManager {
  constructor() {
    this.scenes = new Map();
  }

  registerScene(sceneId, sceneConfig) {
    this.scenes.set(sceneId, sceneConfig);
  }

  async enterScene(userId, sceneId, context = {}) {
    const scene = this.scenes.get(sceneId);
    if (!scene) {
      throw new Error(`Scene ${sceneId} not found`);
    }

    const sceneData = {
      id: sceneId,
      context,
      step: 0,
      enteredAt: Date.now(),
    };

    await this.saveSceneState(userId, sceneData);
    
    if (scene.onEnter) {
      return await scene.onEnter(userId, context);
    }
    
    return scene.initialMessage;
  }

  async handleInput(userId, message, sceneId = null) {
    let sceneData = await this.getSceneState(userId);
    
    if (!sceneData && sceneId) {
      await this.enterScene(userId, sceneId);
      sceneData = await this.getSceneState(userId);
    }
    
    if (!sceneData) {
      return null;
    }
    
    const scene = this.scenes.get(sceneData.id);
    if (!scene) {
      await this.clearSceneState(userId);
      return null;
    }
    
    const currentStep = scene.steps[sceneData.step];
    if (!currentStep) {
      await this.clearSceneState(userId);
      return null;
    }
    
    // Validate input
    if (currentStep.validate) {
      const validation = await currentStep.validate(message, sceneData.context);
      if (!validation.valid) {
        return {
          text: validation.error || 'Invalid input. Please try again.',
          stayInScene: true,
        };
      }
      sceneData.context = { ...sceneData.context, ...validation.data };
    }
    
    // Process input
    if (currentStep.handler) {
      const result = await currentStep.handler(message, sceneData.context);
      sceneData.context = { ...sceneData.context, ...result };
    }
    
    // Move to next step
    sceneData.step++;
    
    // Check if scene is complete
    if (sceneData.step >= scene.steps.length) {
      await this.clearSceneState(userId);
      
      if (scene.onComplete) {
        return await scene.onComplete(userId, sceneData.context);
      }
      
      return {
        text: scene.completionMessage || 'Process completed!',
        nextMenu: scene.nextMenu || 'main',
      };
    }
    
    // Save updated state
    await this.saveSceneState(userId, sceneData);
    
    // Get next step message
    const nextStep = scene.steps[sceneData.step];
    return {
      text: nextStep.message,
      stayInScene: true,
    };
  }

  async saveSceneState(userId, sceneData) {
    const key = `${CACHE_KEYS.WHATSAPP_SESSION(userId)}:scene`;
    await cacheManager.set(key, sceneData, 3600); // 1 hour TTL
  }

  async getSceneState(userId) {
    const key = `${CACHE_KEYS.WHATSAPP_SESSION(userId)}:scene`;
    return await cacheManager.get(key);
  }

  async clearSceneState(userId) {
    const key = `${CACHE_KEYS.WHATSAPP_SESSION(userId)}:scene`;
    await cacheManager.del(key);
  }

  createPurchaseScene() {
    return {
      id: 'purchase',
      steps: [
        {
          message: 'How many tickets would you like?',
          validate: async (input, context) => {
            const quantity = parseInt(input);
            if (isNaN(quantity) || quantity < 1) {
              return { valid: false, error: 'Please enter a valid number' };
            }
            return { valid: true, data: { quantity } };
          },
          handler: async (input, context) => {
            return { quantity: parseInt(input) };
          },
        },
        {
          message: 'Please enter your full name:',
          validate: async (input, context) => {
            if (!input || input.length < 2) {
              return { valid: false, error: 'Please enter a valid name' };
            }
            return { valid: true, data: { fullName: input } };
          },
          handler: async (input, context) => {
            return { fullName: input };
          },
        },
        {
          message: 'Please enter your email address:',
          validate: async (input, context) => {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(input)) {
              return { valid: false, error: 'Please enter a valid email' };
            }
            return { valid: true, data: { email: input } };
          },
          handler: async (input, context) => {
            return { email: input };
          },
        },
        {
          message: 'Please enter your M-Pesa number:',
          validate: async (input, context) => {
            const phoneRegex = /^\+?254[0-9]{9}$|^0[0-9]{9}$/;
            if (!phoneRegex.test(input)) {
              return { valid: false, error: 'Please enter a valid Kenyan phone number' };
            }
            return { valid: true, data: { phone: input } };
          },
          handler: async (input, context) => {
            return { phone: input };
          },
        },
      ],
      onComplete: async (userId, context) => {
        // Process payment
        return {
          text: `✅ Purchase complete! ${context.quantity} tickets booked.`,
          nextMenu: 'main',
        };
      },
      completionMessage: 'Thank you for your purchase!',
      nextMenu: 'main',
    };
  }

  createResaleScene() {
    return {
      id: 'resale',
      steps: [
        {
          message: 'Enter your asking price (KES):',
          validate: async (input, context) => {
            const price = parseInt(input);
            if (isNaN(price) || price < 100) {
              return { valid: false, error: 'Please enter a valid price (minimum KES 100)' };
            }
            return { valid: true, data: { price } };
          },
          handler: async (input, context) => {
            return { askingPrice: parseInt(input) };
          },
        },
        {
          message: 'Confirm listing (YES/NO):',
          validate: async (input, context) => {
            if (!['YES', 'NO'].includes(input.toUpperCase())) {
              return { valid: false, error: 'Please reply with YES or NO' };
            }
            return { valid: true, data: { confirmed: input.toUpperCase() === 'YES' } };
          },
          handler: async (input, context) => {
            return { confirmed: input.toUpperCase() === 'YES' };
          },
        },
      ],
      onComplete: async (userId, context) => {
        if (context.confirmed) {
          // Create resale listing
          return {
            text: `✅ Ticket listed for ${MessageFormatter.formatPrice(context.askingPrice)}!`,
            nextMenu: 'my_tickets',
          };
        } else {
          return {
            text: 'Listing cancelled.',
            nextMenu: 'my_tickets',
          };
        }
      },
    };
  }
}

module.exports = new SceneManager();