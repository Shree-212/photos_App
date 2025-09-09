const { v4: uuidv4 } = require('uuid');

/**
 * EventProcessor handles consuming events from Pub/Sub and triggering notifications
 */
class EventProcessor {
  constructor(pubsub, notificationManager, logger) {
    this.pubsub = pubsub;
    this.notificationManager = notificationManager;
    this.logger = logger;
    this.subscriptions = new Map();
    this.isRunning = false;
  }

  /**
   * Start event processing by creating subscriptions
   */
  async start() {
    try {
      this.isRunning = true;
      
      // Create subscription for task-manager-events topic
      const topicName = 'task-manager-events';
      const subscriptionName = 'notification-service-subscription';
      
      await this.createSubscription(topicName, subscriptionName);
      await this.startListening(subscriptionName);
      
      this.logger.info('Event processor started successfully');

    } catch (error) {
      this.logger.error('Failed to start event processor:', error);
      throw error;
    }
  }

  /**
   * Stop event processing
   */
  async stop() {
    try {
      this.isRunning = false;
      
      // Close all subscriptions
      for (const [name, subscription] of this.subscriptions) {
        subscription.close();
        this.logger.info(`Closed subscription: ${name}`);
      }
      
      this.subscriptions.clear();
      this.logger.info('Event processor stopped');

    } catch (error) {
      this.logger.error('Error stopping event processor:', error);
      throw error;
    }
  }

  /**
   * Create Pub/Sub subscription if it doesn't exist
   */
  async createSubscription(topicName, subscriptionName) {
    try {
      const topic = this.pubsub.topic(topicName);
      
      // Check if topic exists, create if not
      const [topicExists] = await topic.exists();
      if (!topicExists) {
        await topic.create();
        this.logger.info(`Created topic: ${topicName}`);
      }

      // Check if subscription exists, create if not
      const subscription = topic.subscription(subscriptionName);
      const [subscriptionExists] = await subscription.exists();
      
      if (!subscriptionExists) {
        await subscription.create({
          ackDeadlineSeconds: 60,
          messageRetentionDuration: {
            seconds: 604800, // 7 days
          },
          enableMessageOrdering: false,
        });
        this.logger.info(`Created subscription: ${subscriptionName}`);
      }

      this.subscriptions.set(subscriptionName, subscription);

    } catch (error) {
      this.logger.error(`Failed to create subscription ${subscriptionName}:`, error);
      throw error;
    }
  }

  /**
   * Start listening to subscription
   */
  async startListening(subscriptionName) {
    const subscription = this.subscriptions.get(subscriptionName);
    
    if (!subscription) {
      throw new Error(`Subscription not found: ${subscriptionName}`);
    }

    // Configure subscription options
    subscription.options = {
      ackDeadlineSeconds: 60,
      maxMessages: 10,
      allowExcessMessages: false,
      maxExtension: 600 // 10 minutes
    };

    // Message handler
    const messageHandler = async (message) => {
      try {
        this.logger.debug('Received message:', { 
          messageId: message.id,
          data: message.data.toString() 
        });

        // Parse event data
        const eventData = JSON.parse(message.data.toString());
        
        // Process the event
        await this.processEvent(eventData);
        
        // Acknowledge the message
        message.ack();
        
        this.logger.info('Event processed successfully:', {
          messageId: message.id,
          eventType: eventData.eventType,
          correlationId: eventData.correlationId
        });

      } catch (error) {
        this.logger.error('Failed to process message:', {
          messageId: message.id,
          error: error.message
        });
        
        // Nack the message to retry later
        message.nack();
      }
    };

    // Error handler
    const errorHandler = (error) => {
      this.logger.error('Subscription error:', error);
    };

    // Set up listeners
    subscription.on('message', messageHandler);
    subscription.on('error', errorHandler);
    
    this.logger.info(`Started listening to subscription: ${subscriptionName}`);
  }

  /**
   * Process individual events and trigger notifications
   */
  async processEvent(eventData) {
    const { eventType, data, correlationId, timestamp } = eventData;

    this.logger.info('Processing event:', { eventType, correlationId });

    switch (eventType) {
      case 'task.created':
        await this.handleTaskCreated(data, correlationId);
        break;
        
      case 'task.updated':
        await this.handleTaskUpdated(data, correlationId);
        break;
        
      case 'task.deleted':
        await this.handleTaskDeleted(data, correlationId);
        break;
        
      case 'media.uploaded':
        await this.handleMediaUploaded(data, correlationId);
        break;
        
      case 'task.media_attached':
        await this.handleTaskMediaAttached(data, correlationId);
        break;
        
      case 'task.media_detached':
        await this.handleTaskMediaDetached(data, correlationId);
        break;
        
      default:
        this.logger.warn('Unknown event type received:', { eventType, correlationId });
    }
  }

  /**
   * Handle task created event
   */
  async handleTaskCreated(data, correlationId) {
    const { taskId, userId, title, description, priority, dueDate } = data;

    const notification = {
      id: uuidv4(),
      userId,
      type: 'task.created',
      subject: 'New Task Created',
      content: `Your task "${title}" has been created successfully.`,
      metadata: {
        taskId,
        title,
        priority,
        dueDate,
        correlationId
      }
    };

    await this.notificationManager.sendNotification(notification);
  }

  /**
   * Handle task updated event
   */
  async handleTaskUpdated(data, correlationId) {
    const { taskId, userId, title, changes } = data;

    const notification = {
      id: uuidv4(),
      userId,
      type: 'task.updated',
      subject: 'Task Updated',
      content: `Your task "${title}" has been updated.`,
      metadata: {
        taskId,
        title,
        changes,
        correlationId
      }
    };

    await this.notificationManager.sendNotification(notification);
  }

  /**
   * Handle task deleted event
   */
  async handleTaskDeleted(data, correlationId) {
    const { taskId, userId, title } = data;

    const notification = {
      id: uuidv4(),
      userId,
      type: 'task.deleted',
      subject: 'Task Deleted',
      content: `Your task "${title}" has been deleted.`,
      metadata: {
        taskId,
        title,
        correlationId
      }
    };

    await this.notificationManager.sendNotification(notification);
  }

  /**
   * Handle media uploaded event
   */
  async handleMediaUploaded(data, correlationId) {
    const { mediaId, userId, filename, originalName, mimeType, sizeBytes } = data;

    const notification = {
      id: uuidv4(),
      userId,
      type: 'media.uploaded',
      subject: 'File Uploaded Successfully',
      content: `Your file "${originalName}" has been uploaded successfully.`,
      metadata: {
        mediaId,
        filename,
        originalName,
        mimeType,
        sizeBytes,
        correlationId
      }
    };

    await this.notificationManager.sendNotification(notification);
  }

  /**
   * Handle task media attached event
   */
  async handleTaskMediaAttached(data, correlationId) {
    const { taskId, mediaId, userId, taskTitle, mediaFilename } = data;

    const notification = {
      id: uuidv4(),
      userId,
      type: 'task.media_attached',
      subject: 'Media Attached to Task',
      content: `Media "${mediaFilename}" has been attached to your task "${taskTitle}".`,
      metadata: {
        taskId,
        mediaId,
        taskTitle,
        mediaFilename,
        correlationId
      }
    };

    await this.notificationManager.sendNotification(notification);
  }

  /**
   * Handle task media detached event
   */
  async handleTaskMediaDetached(data, correlationId) {
    const { taskId, mediaId, userId, taskTitle, mediaFilename } = data;

    const notification = {
      id: uuidv4(),
      userId,
      type: 'task.media_detached',
      subject: 'Media Removed from Task',
      content: `Media "${mediaFilename}" has been removed from your task "${taskTitle}".`,
      metadata: {
        taskId,
        mediaId,
        taskTitle,
        mediaFilename,
        correlationId
      }
    };

    await this.notificationManager.sendNotification(notification);
  }
}

module.exports = { EventProcessor };
