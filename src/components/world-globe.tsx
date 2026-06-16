'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import type { WorldTrail } from '@/lib/world/types';
import countriesTopo from 'world-atlas/countries-110m.json';
import { feature } from 'topojson-client';
import type GlobeCtor from 'globe.gl';
import type { GlobeInstance } from 'globe.gl';
import { Color, Group, Mesh, MeshBasicMaterial, SphereGeometry, type Material } from 'three';

interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  severity: number;
  displayLevel: 'high' | 'elevated' | 'monitoring';
  title: string;
  timestamp: string;
  nodeType: 'hotspot' | 'exploration' | 'projection';
  scene: string;
  summary: string;
  sourceName: string;
  locationLabel: string;
  confidence?: number;
  ageOpacity?: number;
  activities: Array<{
    mission_id: string;
    mode: 'hotspot' | 'exploration';
    topic: string;
    topic_label: string;
    report_kind: string;
    report_kind_note: string;
    summary: string;
    confidence: number;
    brake_line: string;
    why_now: string;
    watch_next: string;
    signal_stage: string;
    created_at: string;
  }>;
}

interface WorldGlobeProps {
  markers: MapMarker[];
  trails: WorldTrail[];
  activeMarkerId?: string | null;
  onSelectMarker?: (markerId: string) => void;
}

type GlobeMarker = MapMarker & {
  altitude: number;
  color: string;
  glowColor: string;
  glowSize: number;
  pulseScale: number;
};

type GlobeArc = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
  colorPair: [string, string];
  stroke: number;
  altitude: number;
  label: string;
  reason: string;
  confidence: number;
};

const CORE_GEOMETRY = new SphereGeometry(1.35, 18, 18);
const HALO_GEOMETRY = new SphereGeometry(2.8, 18, 18);
const STATIC_GLOBE_VIEW = { lat: 24, lng: 15 };

const DISPLAY_LEVEL_COLORS: Record<MapMarker['displayLevel'], { color: string; glow: string; label: string }> = {
  high: { color: '#e8475f', glow: '#fb7185', label: '高热点' },
  elevated: { color: '#1aafdb', glow: '#38bdf8', label: '升温' },
  monitoring: { color: '#34c79a', glow: '#5eead4', label: '监测' },
};

const globePolygons = feature(
  countriesTopo as never,
  (countriesTopo as { objects: { countries: unknown } }).objects.countries as never,
) as unknown as FeatureCollection;

function popupHtml(marker: MapMarker) {
  const display = DISPLAY_LEVEL_COLORS[marker.displayLevel] || DISPLAY_LEVEL_COLORS.monitoring;
  const color = display.color;
  const activities = Array.isArray(marker.activities) ? marker.activities : [];
  const activityHtml =
    activities.length > 0
      ? activities
          .slice(0, 2)
          .map(
            (activity) => `
              <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(226,232,240,0.95);">
                <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:4px;">
                  <span style="font-size:11px;color:#0f766e;">${activity.topic_label || activity.topic}</span>
                  <span style="font-size:11px;color:#94a3b8;">${new Date(activity.created_at).toLocaleString('zh-CN')}</span>
                </div>
                <div style="font-size:12px;color:#475569;line-height:1.6;">${activity.summary}</div>
              </div>
            `,
          )
          .join('')
      : '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(226,232,240,0.95);font-size:12px;color:#64748b;">这块暂时还没有新的跟进。</div>';

  return `
    <div style="font-family:'Noto Serif SC',STSong,SimSun,serif;min-width:260px;max-width:320px;padding:10px 12px;border-radius:13.6px;background:rgba(255,255,255,0.96);border:1px solid #e2e8f0;box-shadow:0 8px 28px rgba(15,23,42,0.12);">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px;">
        <span style="padding:2px 8px;border-radius:999px;background:${color}22;color:${color};font-size:11px;font-weight:700;">${display.label}</span>
        <span style="font-size:11px;color:#94a3b8;">${marker.scene}</span>
      </div>
      <div style="font-size:13px;line-height:1.6;color:#1e293b;font-weight:600;margin-bottom:8px;">${marker.title}</div>
      <div style="font-size:12px;line-height:1.7;color:#475569;">${marker.summary}</div>
      <div style="margin-top:8px;font-size:11px;line-height:1.7;color:#94a3b8;">
        <div>地点: ${marker.locationLabel}</div>
        <div>最近更新: ${new Date(marker.timestamp).toLocaleString('zh-CN')}${marker.confidence ? ` · 可信度 ${Math.round(marker.confidence * 100)}%` : ''}</div>
      </div>
      ${activityHtml}
    </div>
  `;
}

function hasWebGlSupport() {
  if (typeof document === 'undefined') return false;
  if (typeof navigator !== 'undefined' && navigator.webdriver) return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

function projectMarkerToStaticGlobe(marker: GlobeMarker) {
  const lat = (marker.lat * Math.PI) / 180;
  const lng = (marker.lng * Math.PI) / 180;
  const viewLat = (STATIC_GLOBE_VIEW.lat * Math.PI) / 180;
  const viewLng = (STATIC_GLOBE_VIEW.lng * Math.PI) / 180;
  const deltaLng = lng - viewLng;
  const cosC = Math.sin(viewLat) * Math.sin(lat) + Math.cos(viewLat) * Math.cos(lat) * Math.cos(deltaLng);

  if (cosC <= 0) {
    return null;
  }

  const x = Math.cos(lat) * Math.sin(deltaLng);
  const y = Math.cos(viewLat) * Math.sin(lat) - Math.sin(viewLat) * Math.cos(lat) * Math.cos(deltaLng);

  return {
    x: 50 + x * 42,
    y: 50 - y * 42,
  };
}

export default function WorldGlobe({ markers, trails, activeMarkerId, onSelectMarker }: WorldGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const resumeRotateTimerRef = useRef<number | null>(null);
  const [globeReady, setGlobeReady] = useState(false);
  const [globeFailed, setGlobeFailed] = useState(false);

  const globeMarkers = useMemo<GlobeMarker[]>(
    () =>
      [...markers]
        .sort((a, b) => {
          const order = { high: 3, elevated: 2, monitoring: 1 };
          return order[b.displayLevel] - order[a.displayLevel] || b.severity - a.severity;
        })
        .map((marker) => {
          const display = DISPLAY_LEVEL_COLORS[marker.displayLevel] || DISPLAY_LEVEL_COLORS.monitoring;
          const isActive = activeMarkerId === marker.id;
          return {
            ...marker,
            color: isActive ? '#0f172a' : display.color,
            glowColor: display.glow,
            glowSize:
              isActive ? 1.5 : marker.displayLevel === 'high' ? 1.28 : marker.displayLevel === 'elevated' ? 1.08 : 0.9,
            pulseScale: isActive ? 1.34 : marker.displayLevel === 'high' ? 1.14 : 1,
            altitude:
              isActive ? 0.018 : marker.displayLevel === 'high' ? 0.014 : marker.displayLevel === 'elevated' ? 0.011 : 0.009,
          };
        }),
    [activeMarkerId, markers],
  );

  const globeArcs = useMemo<GlobeArc[]>(
    () =>
      trails.flatMap((trail) =>
        trail.edges.map((edge, index) => {
          return {
            startLat: edge.start_lat,
            startLng: edge.start_lng,
            endLat: edge.end_lat,
            endLng: edge.end_lng,
            color: '#3db89a',
            colorPair: index === trail.edges.length - 1 ? ['#99f6e4', '#3db89a'] : ['#7dd3fc', '#34c79a'],
            stroke: index === trail.edges.length - 1 ? 1.1 : 0.72,
            altitude: 0.13,
            label: edge.label,
            reason: edge.reason,
            confidence: edge.confidence,
          };
        }),
      ),
    [trails],
  );

  const focusTargetId = activeMarkerId || globeMarkers[0]?.id || null;
  const fallbackProjectedMarkers = useMemo(
    () =>
      globeMarkers
        .map((marker) => ({
          marker,
          projection: projectMarkerToStaticGlobe(marker),
        }))
        .filter((item): item is { marker: GlobeMarker; projection: { x: number; y: number } } => Boolean(item.projection))
        .slice(0, 14),
    [globeMarkers],
  );

  useEffect(() => {
    let mounted = true;
    let resizeObserver: ResizeObserver | null = null;
    let animationFrame = 0;
    let resizeHandler: (() => void) | null = null;

    const init = async () => {
      if (!containerRef.current || globeRef.current || globeFailed) return;

      try {
        setGlobeReady(false);
        if (!hasWebGlSupport()) {
          throw new Error('WebGL unavailable');
        }

        const globeModule = await import('globe.gl');
        const Globe = (globeModule.default || globeModule) as typeof GlobeCtor;
        const container = containerRef.current;
        const globe = new Globe(container);

        if (!mounted) {
          globe._destructor?.();
          return;
        }

        globeRef.current = globe;
        globe
          .backgroundColor('rgba(0,0,0,0)')
          .showAtmosphere(true)
          .atmosphereColor('#9ad4ca')
          .atmosphereAltitude(0.1);

        const globeMaterial = globe.globeMaterial() as Material & { color?: Color };
        if ('color' in globeMaterial) {
          globeMaterial.color = new Color('#dde7ef');
        }

        globe
          .polygonsData(globePolygons.features)
          .polygonCapColor(() => 'rgba(248, 250, 252, 0.72)')
          .polygonSideColor(() => 'rgba(226, 232, 240, 0.46)')
          .polygonStrokeColor(() => 'rgba(148, 163, 184, 0.56)')
          .polygonAltitude(() => 0.006);

        globe.controls().autoRotate = true;
        globe.controls().autoRotateSpeed = 0.28;
        globe.controls().enablePan = false;
        globe.controls().enableDamping = true;
        globe.pointOfView({ lat: 24, lng: 15, altitude: 1.22 }, 0);

        const setSize = () => {
          if (!containerRef.current || !globeRef.current) return;
          const { clientWidth, clientHeight } = containerRef.current;
          if (clientWidth <= 0 || clientHeight <= 0) return;
          globeRef.current.width(clientWidth);
          globeRef.current.height(clientHeight);
        };

        setSize();
        animationFrame = window.requestAnimationFrame(setSize);
        resizeObserver = new ResizeObserver(setSize);
        resizeObserver.observe(container);
        if (container.parentElement) {
          resizeObserver.observe(container.parentElement);
        }
        resizeHandler = setSize;
        window.addEventListener('resize', resizeHandler);
        if (mounted) {
          setGlobeReady(true);
        }
      } catch (error) {
        console.warn('[world-globe] failed to initialize globe, falling back to static view', error);
        if (mounted) {
          setGlobeReady(false);
          setGlobeFailed(true);
        }
      }
    };

    void init();

    return () => {
      mounted = false;
      if (resumeRotateTimerRef.current) {
        window.clearTimeout(resumeRotateTimerRef.current);
      }
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      resizeObserver?.disconnect();
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
      }
      globeRef.current?._destructor?.();
      globeRef.current = null;
    };
  }, [globeFailed]);

  useEffect(() => {
    if (!globeRef.current || globeFailed) return;

    try {
      globeRef.current
        .objectsData(globeMarkers)
        .objectLat('lat')
        .objectLng('lng')
        .objectAltitude('altitude')
        .objectFacesSurface(false)
        .objectThreeObject((marker) => {
          const point = marker as GlobeMarker;
          const group = new Group();

          const halo = new Mesh(
            HALO_GEOMETRY,
            new MeshBasicMaterial({
              color: point.glowColor,
              transparent: true,
              opacity: (activeMarkerId === point.id ? 0.38 : 0.22) * (point.ageOpacity ?? 1),
              depthWrite: false,
            }),
          );
          halo.scale.setScalar(point.glowSize * point.pulseScale);

          const core = new Mesh(
            CORE_GEOMETRY,
            new MeshBasicMaterial({
              color: point.color,
              transparent: true,
              opacity: Math.max(0.16, 0.98 * (point.ageOpacity ?? 1)),
              depthWrite: false,
            }),
          );
          core.scale.setScalar(point.glowSize);

          group.add(halo);
          group.add(core);
          return group;
        })
        .objectLabel((marker) => popupHtml(marker as GlobeMarker))
        .onObjectClick((point) => {
          const marker = point as GlobeMarker | null;
          if (marker?.id) {
            onSelectMarker?.(marker.id);
          }
        })
        .onObjectHover((point) => {
          if (containerRef.current) {
            containerRef.current.style.cursor = point ? 'pointer' : 'grab';
          }
        });

      globeRef.current
        .ringsData(globeMarkers.filter((marker) => marker.displayLevel !== 'monitoring' || marker.id === activeMarkerId))
        .ringLat('lat')
        .ringLng('lng')
        .ringAltitude((marker: object) => ((marker as GlobeMarker).altitude || 0.01) + 0.001)
        .ringColor((marker: object) => {
          const point = marker as GlobeMarker;
          return [point.glowColor, 'rgba(0,0,0,0)'];
        })
        .ringMaxRadius((marker: object) => ((marker as GlobeMarker).displayLevel === 'high' ? 2.6 : 1.8))
        .ringPropagationSpeed((marker: object) => {
          const point = marker as GlobeMarker;
          const opacityScale = Math.max(0.45, point.ageOpacity ?? 1);
          return (point.id === activeMarkerId ? 0.7 : 0.45) * opacityScale;
        })
        .ringRepeatPeriod((marker: object) => {
          const point = marker as GlobeMarker;
          return point.id === activeMarkerId ? 720 : (point.ageOpacity ?? 1) < 0.45 ? 1600 : 1200;
        });

      globeRef.current
        .arcsData(globeArcs)
        .arcStartLat('startLat')
        .arcStartLng('startLng')
        .arcEndLat('endLat')
        .arcEndLng('endLng')
        .arcColor('colorPair')
        .arcAltitude('altitude')
        .arcStroke('stroke')
        .arcDashLength(0.56)
        .arcDashGap(0.42)
        .arcDashAnimateTime(1800)
        .arcLabel((arc) => {
          const item = arc as GlobeArc;
          return `<div style="font-family:'Noto Serif SC',STSong,SimSun,serif;min-width:220px;max-width:280px;padding:8px 10px;border-radius:10.2px;background:rgba(255,255,255,0.96);border:1px solid #e2e8f0;box-shadow:0 8px 28px rgba(15,23,42,0.12);color:#1e293b;">
            <div style="font-size:11px;color:#0f766e;font-weight:700;margin-bottom:4px;">${item.label}</div>
            <div style="font-size:12px;line-height:1.6;color:#334155;">${item.reason}</div>
            <div style="margin-top:6px;font-size:11px;color:#64748b;">把握度 ${Math.round(item.confidence * 100)}%</div>
          </div>`;
        });
    } catch (error) {
      console.warn('[world-globe] failed to refresh globe scene, falling back to static view', error);
      setGlobeFailed(true);
    }
  }, [activeMarkerId, globeArcs, globeFailed, globeMarkers, onSelectMarker]);

  useEffect(() => {
    if (!globeRef.current || !focusTargetId) return;

    const activeMarker = globeMarkers.find((marker) => marker.id === focusTargetId);
    if (!activeMarker) return;

    globeRef.current.controls().autoRotate = false;
    globeRef.current.pointOfView(
      {
        lat: activeMarker.lat,
        lng: activeMarker.lng,
          altitude: activeMarker.displayLevel === 'high' ? 0.9 : 1,
      },
      1800,
    );

    if (resumeRotateTimerRef.current) {
      window.clearTimeout(resumeRotateTimerRef.current);
    }

    resumeRotateTimerRef.current = window.setTimeout(() => {
      if (globeRef.current) {
        globeRef.current.controls().autoRotate = true;
      }
    }, 6800);

    return () => {
      if (resumeRotateTimerRef.current) {
        window.clearTimeout(resumeRotateTimerRef.current);
      }
    };
  }, [focusTargetId, globeMarkers]);

  if (globeFailed) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_50%_18%,rgba(124,196,184,0.08)_0%,rgba(248,250,252,0)_28%),linear-gradient(180deg,var(--bg-page)_0%,var(--bg-secondary)_100%)] p-5">
        <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-container)]/85 px-4 py-3 text-sm text-[var(--text-secondary)] shadow-sm backdrop-blur">
          当前浏览器不支持 WebGL，已切换为静态地球；落点和列表信息都能继续查看。
        </div>
        <div className="grid h-[calc(100%-5rem)] grid-cols-1 gap-4">
          <div className="relative min-h-[24rem] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[radial-gradient(circle_at_50%_42%,rgba(124,196,184,0.12)_0%,rgba(248,250,252,0)_58%),linear-gradient(180deg,var(--bg-page),#eef2f6)]">
            <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:48px_48px]" />
            <div className="absolute left-1/2 top-1/2 h-[86%] w-[86%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--border-hover)] bg-[radial-gradient(circle_at_45%_35%,rgba(255,255,255,0.72)_0%,rgba(232,237,242,0.92)_44%,rgba(203,213,225,0.68)_100%)] shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
              <div className="absolute inset-[7%] rounded-full border border-[var(--border-default)]" />
              <div className="absolute inset-[18%] rounded-full border border-[var(--border-default)]" />
              <div className="absolute left-1/2 top-[6%] h-[88%] w-px -translate-x-1/2 bg-[var(--border-hover)]" />
              <div className="absolute left-[28%] top-[10%] h-[80%] w-px -rotate-[12deg] bg-[var(--border-hover)]" />
              <div className="absolute right-[28%] top-[10%] h-[80%] w-px rotate-[12deg] bg-[var(--border-hover)]" />
              <div className="absolute left-[10%] top-1/2 h-px w-[80%] -translate-y-1/2 bg-[var(--border-hover)]" />
              <div className="absolute left-[14%] top-[34%] h-px w-[72%] bg-[var(--border-hover)]" />
              <div className="absolute left-[14%] top-[66%] h-px w-[72%] bg-[var(--border-hover)]" />

              {fallbackProjectedMarkers.map(({ marker, projection }) => {
                const display = DISPLAY_LEVEL_COLORS[marker.displayLevel] || DISPLAY_LEVEL_COLORS.monitoring;
                const isActive = activeMarkerId === marker.id;
                return (
                  <button
                    key={marker.id}
                    type="button"
                    onClick={() => onSelectMarker?.(marker.id)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 transition hover:scale-105"
                    style={{ left: `${projection.x}%`, top: `${projection.y}%` }}
                    title={marker.title}
                  >
                    <span
                      className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[10px]"
                      style={{ background: `${display.glow}${isActive ? 'aa' : '66'}` }}
                    />
                    <span
                      className="relative block rounded-full border"
                      style={{
                        width: isActive ? 15 : marker.displayLevel === 'high' ? 13 : 11,
                        height: isActive ? 15 : marker.displayLevel === 'high' ? 13 : 11,
                        background: isActive ? '#0f172a' : display.color,
                        borderColor: isActive ? '#0f172a' : `${display.color}55`,
                        boxShadow: `0 0 16px ${display.glow}`,
                      }}
                    />
                  </button>
                );
              })}
            </div>

            <div className="absolute left-4 top-4 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-container)]/85 px-3 py-2 text-xs text-[var(--text-secondary)] backdrop-blur">
              静态地球视图
            </div>
            <div className="absolute bottom-4 left-4 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-container)]/85 px-3 py-2 text-xs text-[var(--text-secondary)] backdrop-blur">
              可见落点 {fallbackProjectedMarkers.length} / {globeMarkers.length}
            </div>
          </div>

          <div className="hidden space-y-3 overflow-auto pr-1">
            {globeMarkers.slice(0, 10).map((marker) => (
              <button
                key={marker.id}
                type="button"
                onClick={() => onSelectMarker?.(marker.id)}
                className={`w-full rounded-[var(--radius-lg)] border px-4 py-3 text-left transition ${
                  activeMarkerId === marker.id
                    ? 'border-teal-300 bg-teal-50 shadow-sm'
                    : 'border-[var(--border-default)] bg-[var(--bg-container)] hover:border-teal-300'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{
                      background: `${(DISPLAY_LEVEL_COLORS[marker.displayLevel] || DISPLAY_LEVEL_COLORS.monitoring).color}22`,
                      color: (DISPLAY_LEVEL_COLORS[marker.displayLevel] || DISPLAY_LEVEL_COLORS.monitoring).color,
                    }}
                  >
                    {(DISPLAY_LEVEL_COLORS[marker.displayLevel] || DISPLAY_LEVEL_COLORS.monitoring).label}
                  </span>
                  <span className="text-[11px] text-[var(--text-tertiary)]">{marker.scene}</span>
                </div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{marker.title}</p>
                <p className="mt-2 line-clamp-3 text-xs leading-6 text-[var(--text-secondary)]">{marker.summary}</p>
                <div className="mt-3 text-[11px] text-[var(--text-tertiary)]">
                  <div>{marker.locationLabel}</div>
                  <div>{new Date(marker.timestamp).toLocaleString('zh-CN')}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
      <div className="relative h-full w-full max-w-full overflow-hidden bg-[radial-gradient(circle_at_50%_20%,rgba(124,196,184,0.08)_0%,rgba(239,246,250,0)_30%),linear-gradient(180deg,#eef4f8_0%,#e8eef4_100%)]">
      <div ref={containerRef} className="relative h-full w-full max-w-full" />

      {!globeReady ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[radial-gradient(circle_at_50%_42%,rgba(124,196,184,0.14)_0%,rgba(241,243,245,0.08)_54%,rgba(248,250,252,0.08)_100%)]">
          <div className="relative aspect-square w-[72%] max-w-[34rem] rounded-full border border-[var(--border-hover)] bg-[radial-gradient(circle_at_44%_34%,rgba(255,255,255,0.76)_0%,rgba(232,237,242,0.9)_42%,rgba(203,213,225,0.62)_100%)] shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
            <div className="absolute inset-[8%] rounded-full border border-[var(--border-default)]" />
            <div className="absolute inset-[20%] rounded-full border border-[var(--border-default)]" />
            <div className="absolute left-1/2 top-[7%] h-[86%] w-px -translate-x-1/2 bg-[var(--border-hover)]" />
            <div className="absolute left-[11%] top-1/2 h-px w-[78%] -translate-y-1/2 bg-[var(--border-hover)]" />
            {fallbackProjectedMarkers.slice(0, 18).map(({ marker, projection }) => {
              const display = DISPLAY_LEVEL_COLORS[marker.displayLevel] || DISPLAY_LEVEL_COLORS.monitoring;
              return (
                <span
                  key={`loading-${marker.id}`}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${projection.x}%`,
                    top: `${projection.y}%`,
                    width: marker.displayLevel === 'high' ? 12 : 9,
                    height: marker.displayLevel === 'high' ? 12 : 9,
                    background: display.color,
                    boxShadow: `0 0 18px ${display.glow}`,
                    opacity: Math.max(0.46, marker.ageOpacity ?? 1),
                  }}
                />
              );
            })}
          </div>
          <div className="absolute bottom-4 left-4 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-container)]/85 px-3.5 py-2 text-xs text-[var(--text-secondary)] shadow-sm backdrop-blur">
            地图加载中 · 信号 {markers.length}
          </div>
        </div>
      ) : null}

      <div className="absolute left-4 top-4 z-10 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-container)]/85 px-4 py-2.5 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)]">
          {[
            { key: 'high', label: '高热点', color: DISPLAY_LEVEL_COLORS.high.color },
            { key: 'elevated', label: '升温', color: DISPLAY_LEVEL_COLORS.elevated.color },
            { key: 'monitoring', label: '监测', color: DISPLAY_LEVEL_COLORS.monitoring.color },
          ].map((item) => (
            <div key={item.key} className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full shadow-[0_0_14px_currentColor]" style={{ background: item.color, color: item.color }} />
              <span>{item.label}</span>
            </div>
          ))}
          {trails.length > 0 ? (
            <div className="flex items-center gap-2 text-teal-700">
              <div className="h-[2px] w-5 rounded-full bg-teal-400 shadow-[0_0_12px_rgba(20,184,166,0.35)]" />
              <span>事件脉络</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="absolute bottom-4 left-4 z-10 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-container)]/85 px-3.5 py-2 text-xs text-[var(--text-secondary)] shadow-sm backdrop-blur">
        信号 <span className="font-semibold text-[var(--text-primary)]">{markers.length}</span>
      </div>
    </div>
  );
}
