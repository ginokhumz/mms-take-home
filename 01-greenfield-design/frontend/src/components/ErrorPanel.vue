<script setup lang="ts">
import type { ApiError } from '../api/errors';

const props = defineProps<{
  error: ApiError;
  onRetry?: (() => void) | undefined;
  onRestart?: (() => void) | undefined;
}>();

// The retry affordance appears if and only if `retryable` is true — never inferred from the status
// code, because 409 is mixed: a closed edit window can never succeed on a retry, while a publish
// still in progress can.
const showRetry = (): boolean => props.error.retryable && props.onRetry !== undefined;

// A rejected cursor is terminal, and the remedy is starting again at page 1 rather than repeating
// the request that failed. Different remedy, different button.
const showRestart = (): boolean =>
  props.error.code === 'invalid_cursor' && props.onRestart !== undefined;
</script>

<template>
  <div role="alert" class="error-panel">
    <!-- The message is already end-user safe; the client never composes its own wording. -->
    <p class="error-message">{{ error.message }}</p>
    <p class="error-meta"><code>{{ error.code }}</code> · HTTP {{ error.status }}</p>
    <!-- The request id is shown so that a user report is debuggable from the server side. -->
    <p class="error-meta muted">Reference: <code>{{ error.requestId }}</code></p>
    <button v-if="showRetry()" type="button" @click="onRetry?.()">Try again</button>
    <button v-if="showRestart()" type="button" @click="onRestart?.()">Start from the top</button>
  </div>
</template>

<style scoped>
.error-panel {
  border: 1px solid #b3261e;
  border-left-width: 4px;
  padding: 0.75rem 1rem;
  margin: 0.75rem 0;
  background: #fff5f5;
}
.error-message {
  margin: 0 0 0.35rem;
  font-weight: 600;
}
.error-meta {
  margin: 0 0 0.35rem;
  font-size: 0.8rem;
}
.muted {
  color: #666;
}
</style>
