const { v4: uuidv4 } = require('uuid');

/**
 * NotificationManager handles the creation, storage, and delivery of notifications
 */
class NotificationManager {
  constructor(pool, redis, emailTransporter, logger) {
    this.pool = pool;
    this.redis = redis;
    this.emailTransporter = emailTransporter;
    this.logger = logger;
  }

  /**
   * Initialize database tables for notifications
   */
  async initialize() {
    try {
      // Create notification preferences table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS notification_preferences (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          email_enabled BOOLEAN DEFAULT true,
          push_enabled BOOLEAN DEFAULT true,
          task_created BOOLEAN DEFAULT true,
          task_updated BOOLEAN DEFAULT true,
          task_deleted BOOLEAN DEFAULT false,
          media_uploaded BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id)
        )
      `);

      // Create notification history table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS notification_history (
          id SERIAL PRIMARY KEY,
          notification_id VARCHAR(255) NOT NULL UNIQUE,
          user_id INTEGER NOT NULL,
          type VARCHAR(100) NOT NULL,
          subject VARCHAR(255),
          content TEXT,
          delivery_method VARCHAR(50),
          status VARCHAR(50) DEFAULT 'pending',
          sent_at TIMESTAMP,
          error_message TEXT,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_notification_history_user_id 
        ON notification_history(user_id);
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_notification_history_created_at 
        ON notification_history(created_at);
      `);

      this.logger.info('Notification database tables initialized');

    } catch (error) {
      this.logger.error('Failed to initialize notification tables:', error);
      throw error;
    }
  }

  /**
   * Send notification based on type
   */
  async sendNotification(notification) {
    try {
      // Store notification in history
      await this.storeNotificationHistory(notification);

      // Get user preferences
      const preferences = await this.getUserPreferences(notification.userId);

      // Check if notification type is enabled
      if (!this.isNotificationEnabled(notification.type, preferences)) {
        this.logger.info('Notification disabled for user:', { 
          userId: notification.userId, 
          type: notification.type 
        });
        return;
      }

      // Send email if enabled
      if (preferences.email_enabled) {
        await this.sendEmailNotification(notification);
      }

      // TODO: Implement push notifications
      if (preferences.push_enabled) {
        await this.sendPushNotification(notification);
      }

      // Update status to sent
      await this.updateNotificationStatus(notification.id, 'sent');

    } catch (error) {
      this.logger.error('Failed to send notification:', error);
      await this.updateNotificationStatus(notification.id, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Send email notification
   */
  async sendEmailNotification(notification) {
    try {
      // Get user email
      const userResult = await this.pool.query(
        'SELECT email FROM users WHERE id = $1',
        [notification.userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error(`User not found: ${notification.userId}`);
      }

      const userEmail = userResult.rows[0].email;

      const mailOptions = {
        from: process.env.SMTP_FROM || 'Task Manager <noreply@taskmanager.com>',
        to: userEmail,
        subject: notification.subject,
        html: this.generateEmailHTML(notification),
        text: notification.content
      };

      await this.emailTransporter.sendMail(mailOptions);

      this.logger.info('Email notification sent:', {
        notificationId: notification.id,
        userId: notification.userId,
        email: userEmail,
        type: notification.type
      });

    } catch (error) {
      this.logger.error('Failed to send email notification:', error);
      throw error;
    }
  }

  /**
   * Send push notification (placeholder implementation)
   */
  async sendPushNotification(notification) {
    // TODO: Implement push notification logic
    // This could integrate with Firebase Cloud Messaging, Apple Push Notification service, etc.
    this.logger.info('Push notification placeholder:', {
      notificationId: notification.id,
      userId: notification.userId,
      type: notification.type
    });
  }

  /**
   * Generate HTML email template
   */
  generateEmailHTML(notification) {
    const baseHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${notification.subject}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { border-bottom: 2px solid #007bff; padding-bottom: 20px; margin-bottom: 30px; }
          .title { color: #007bff; font-size: 24px; margin: 0; }
          .content { line-height: 1.6; color: #333; }
          .metadata { background-color: #f8f9fa; padding: 15px; border-radius: 4px; margin-top: 20px; font-size: 14px; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 12px; color: #6c757d; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="title">Task Manager Notification</h1>
          </div>
          <div class="content">
            <h2>${notification.subject}</h2>
            <p>${notification.content}</p>
            ${this.generateMetadataHTML(notification.metadata)}
          </div>
          <div class="footer">
            <p>This is an automated notification from Task Manager. If you no longer wish to receive these notifications, please update your preferences in the app.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return baseHTML;
  }

  /**
   * Generate metadata HTML for email
   */
  generateMetadataHTML(metadata) {
    if (!metadata || Object.keys(metadata).length === 0) {
      return '';
    }

    let metadataHTML = '<div class="metadata"><strong>Details:</strong><br>';
    
    for (const [key, value] of Object.entries(metadata)) {
      metadataHTML += `<strong>${this.formatKey(key)}:</strong> ${value}<br>`;
    }
    
    metadataHTML += '</div>';
    return metadataHTML;
  }

  /**
   * Format metadata keys for display
   */
  formatKey(key) {
    return key.replace(/([A-Z])/g, ' $1')
              .replace(/^./, str => str.toUpperCase())
              .replace(/_/g, ' ');
  }

  /**
   * Store notification in history
   */
  async storeNotificationHistory(notification) {
    const query = `
      INSERT INTO notification_history 
      (notification_id, user_id, type, subject, content, delivery_method, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    await this.pool.query(query, [
      notification.id,
      notification.userId,
      notification.type,
      notification.subject,
      notification.content,
      'email', // Default delivery method
      JSON.stringify(notification.metadata || {})
    ]);
  }

  /**
   * Update notification status
   */
  async updateNotificationStatus(notificationId, status, errorMessage = null) {
    const query = `
      UPDATE notification_history 
      SET status = $1, sent_at = CURRENT_TIMESTAMP, error_message = $2
      WHERE notification_id = $3
    `;

    await this.pool.query(query, [status, errorMessage, notificationId]);
  }

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userId) {
    try {
      const result = await this.pool.query(
        'SELECT * FROM notification_preferences WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        // Create default preferences
        const defaultPreferences = {
          user_id: userId,
          email_enabled: true,
          push_enabled: true,
          task_created: true,
          task_updated: true,
          task_deleted: false,
          media_uploaded: true
        };

        await this.pool.query(`
          INSERT INTO notification_preferences 
          (user_id, email_enabled, push_enabled, task_created, task_updated, task_deleted, media_uploaded)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          userId,
          defaultPreferences.email_enabled,
          defaultPreferences.push_enabled,
          defaultPreferences.task_created,
          defaultPreferences.task_updated,
          defaultPreferences.task_deleted,
          defaultPreferences.media_uploaded
        ]);

        return defaultPreferences;
      }

      return result.rows[0];

    } catch (error) {
      this.logger.error('Failed to get user preferences:', error);
      throw error;
    }
  }

  /**
   * Update user notification preferences
   */
  async updateUserPreferences(userId, preferences) {
    const query = `
      UPDATE notification_preferences 
      SET email_enabled = $1, push_enabled = $2, task_created = $3, 
          task_updated = $4, task_deleted = $5, media_uploaded = $6,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $7
    `;

    await this.pool.query(query, [
      preferences.email_enabled,
      preferences.push_enabled,
      preferences.task_created,
      preferences.task_updated,
      preferences.task_deleted,
      preferences.media_uploaded,
      userId
    ]);
  }

  /**
   * Check if notification type is enabled for user
   */
  isNotificationEnabled(notificationType, preferences) {
    const typeMap = {
      'task.created': 'task_created',
      'task.updated': 'task_updated',
      'task.deleted': 'task_deleted',
      'media.uploaded': 'media_uploaded',
      'task.media_attached': 'task_updated',
      'task.media_detached': 'task_updated'
    };

    const preferenceKey = typeMap[notificationType];
    return preferenceKey ? preferences[preferenceKey] : false;
  }

  /**
   * Get notification history for user
   */
  async getNotificationHistory(userId, limit = 50, offset = 0) {
    const query = `
      SELECT notification_id, type, subject, content, delivery_method, 
             status, sent_at, created_at, metadata
      FROM notification_history 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;

    const result = await this.pool.query(query, [userId, limit, offset]);
    return result.rows;
  }
}

module.exports = { NotificationManager };
