<script setup lang="ts">
import { CalendarDays, CircleAlert, ExternalLink, UserRound } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import type { MemoryVideo } from "../types";
import { formatDuration, formatFavoriteDate } from "../format";
import { coverSources } from "../cover-sources.js";

const props = defineProps<{
  video: MemoryVideo;
  proxyBaseUrl?: string;
}>();

const sources = computed(() => coverSources(props.video.coverUrl, props.proxyBaseUrl));
const sourceIndex = ref(0);
const coverUrl = computed(() => sources.value[sourceIndex.value] || "");
const usesProxy = computed(() => coverUrl.value.includes("/api/cover?path="));
watch(sources, () => { sourceIndex.value = 0; });

function handleImageError() {
  sourceIndex.value += 1;
}
</script>

<template>
<article class="memory-card">
  <a
    class="memory-card__cover"
    :class="{ 'memory-card__cover--empty': !coverUrl }"
    :href="video.videoUrl"
    target="_blank"
    rel="noreferrer"
    :aria-label="`打开 ${video.title}`"
  >
    <img
      v-if="coverUrl"
      :key="coverUrl"
      :crossorigin="usesProxy ? 'anonymous' : undefined"
      :src="coverUrl"
      :alt="video.title"
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="handleImageError"
    />
    <span v-if="video.duration" class="memory-card__duration">{{ formatDuration(video.duration) }}</span>
    <span class="memory-card__date-stamp">{{ formatFavoriteDate(video.favoriteAt) }}</span>
  </a>

  <div class="memory-card__body">
    <div class="memory-card__eyebrow">
      <span class="memory-card__saved-date"><CalendarDays :size="14" /> 收藏于 {{ formatFavoriteDate(video.favoriteAt) }}</span>
      <span v-if="video.isInvalid" class="memory-card__invalid"><CircleAlert :size="14" /> 已失效</span>
    </div>
    <h3>
      <a :href="video.videoUrl" target="_blank" rel="noreferrer">{{ video.title }}</a>
    </h3>
    <p class="memory-card__description">{{ video.description || "当时没有留下简介，但这段收藏还在。" }}</p>
    <div class="memory-card__footer">
      <span class="memory-card__uploader" :title="video.uploader"><UserRound :size="14" /><span>{{ video.uploader }}</span></span>
      <a :href="video.videoUrl" target="_blank" rel="noreferrer" class="memory-card__open">
        去看看 <ExternalLink :size="14" />
      </a>
    </div>
  </div>
</article>
</template>
