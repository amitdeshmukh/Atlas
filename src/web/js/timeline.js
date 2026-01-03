/**
 * Timeline Component
 * Handles temporal navigation and time slider
 */

export class Timeline {
  constructor() {
    this.slider = document.getElementById('timeline-slider');
    this.currentTimeDisplay = document.getElementById('current-time');
    this.liveBtn = document.getElementById('live-btn');
    this.customTimeInput = document.getElementById('custom-time');

    this.minTime = null;
    this.maxTime = null;
    this.currentTime = new Date();

    this.onTimeChangeCallback = null;

    this.init();
  }

  init() {
    // Set initial state to "live" (current time)
    this.setToLive();

    // Slider change handler
    this.slider.addEventListener('input', () => {
      this.handleSliderChange();
    });

    // Live button handler
    this.liveBtn.addEventListener('click', () => {
      this.setToLive();
    });

    // Custom time input handler
    this.customTimeInput.addEventListener('change', () => {
      this.handleCustomTimeChange();
    });
  }

  /**
   * Set the time range for the timeline
   */
  setTimeRange(minTime, maxTime) {
    this.minTime = minTime ? new Date(minTime) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // Default: 1 year ago
    this.maxTime = maxTime ? new Date(maxTime) : new Date(); // Default: now

    // Update slider
    this.slider.min = 0;
    this.slider.max = 100;
    this.slider.value = 100; // Start at "live"

    this.updateDisplay();
  }

  /**
   * Set timeline to "live" (current time)
   */
  setToLive() {
    this.currentTime = new Date();
    this.slider.value = 100;
    this.updateDisplay();
    this.emitTimeChange();
  }

  /**
   * Handle slider position change
   */
  handleSliderChange() {
    if (!this.minTime || !this.maxTime) {
      return;
    }

    const position = parseInt(this.slider.value);

    // Convert slider position (0-100) to timestamp
    const timeRange = this.maxTime.getTime() - this.minTime.getTime();
    const timestamp = this.minTime.getTime() + (timeRange * position / 100);

    this.currentTime = new Date(timestamp);
    this.updateDisplay();
    this.emitTimeChange();
  }

  /**
   * Handle custom time input change
   */
  handleCustomTimeChange() {
    const customValue = this.customTimeInput.value;
    if (!customValue) {
      return;
    }

    try {
      const customTime = new Date(customValue);

      if (isNaN(customTime.getTime())) {
        console.error('Invalid date');
        return;
      }

      this.currentTime = customTime;

      // Update slider position
      if (this.minTime && this.maxTime) {
        const timeRange = this.maxTime.getTime() - this.minTime.getTime();
        const offset = this.currentTime.getTime() - this.minTime.getTime();
        const position = Math.max(0, Math.min(100, (offset / timeRange) * 100));
        this.slider.value = position;
      }

      this.updateDisplay();
      this.emitTimeChange();
    } catch (error) {
      console.error('Error parsing custom time:', error);
    }
  }

  /**
   * Update the display with current time
   */
  updateDisplay() {
    const timeString = this.currentTime.toISOString();
    this.currentTimeDisplay.textContent = this.formatTimestamp(this.currentTime);

    // Update custom time input
    const localTime = new Date(this.currentTime.getTime() - this.currentTime.getTimezoneOffset() * 60000);
    this.customTimeInput.value = localTime.toISOString().slice(0, 16);
  }

  /**
   * Format timestamp for display
   */
  formatTimestamp(date) {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday && this.slider.value == 100) {
      return 'Live (Now)';
    }

    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    };

    return date.toLocaleString('en-US', options);
  }

  /**
   * Get current time as ISO string for GraphQL queries
   */
  getCurrentTime() {
    return this.currentTime.toISOString();
  }

  /**
   * Check if we're in "live" mode
   */
  isLive() {
    return this.slider.value == 100;
  }

  /**
   * Register callback for time changes
   */
  onTimeChange(callback) {
    this.onTimeChangeCallback = callback;
  }

  /**
   * Emit time change event
   */
  emitTimeChange() {
    if (this.onTimeChangeCallback) {
      const asOf = this.isLive() ? null : this.getCurrentTime();
      this.onTimeChangeCallback(asOf);
    }
  }

  /**
   * Analyze data to determine time range
   */
  analyzeDataTimeRange(elements) {
    if (!elements || !elements.nodes || elements.nodes.length === 0) {
      // No data, use default range
      this.setTimeRange(null, null);
      return;
    }

    let minTime = null;
    let maxTime = null;

    // Find earliest and latest timestamps in data
    const allElements = [...elements.nodes, ...(elements.edges || [])];

    for (const element of allElements) {
      const data = element.data;

      if (data.validAt) {
        const validAt = new Date(data.validAt);
        if (!minTime || validAt < minTime) {
          minTime = validAt;
        }
        if (!maxTime || validAt > maxTime) {
          maxTime = validAt;
        }
      }

      if (data.invalidAt) {
        const invalidAt = new Date(data.invalidAt);
        if (!maxTime || invalidAt > maxTime) {
          maxTime = invalidAt;
        }
      }
    }

    // Add some padding to the range
    if (minTime) {
      minTime = new Date(minTime.getTime() - 7 * 24 * 60 * 60 * 1000); // 1 week before
    }

    if (maxTime) {
      maxTime = new Date(Math.max(maxTime.getTime(), new Date().getTime())); // At least current time
    }

    this.setTimeRange(minTime, maxTime);
  }
}
