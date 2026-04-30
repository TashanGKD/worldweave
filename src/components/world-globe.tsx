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
  high: { color: '#ff5c73', glow: '#ff6b81', label: '高热点' },
  elevated: { color: '#28d7ff', glow: '#19c8ff', label: '升温' },
  monitoring: { color: '#86ffd8', glow: '#74f0d2', label: '监测' },
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
              <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(148,163,184,0.24);">
                <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:4px;">
                  <span style="font-size:11px;color:#dbeafe;">${activity.topic_label || activity.topic}</span>
                  <span style="font-size:11px;color:#94a3b8;">${new Date(activity.created_at).toLocaleString('zh-CN')}</span>
                </div>
                <div style="font-size:12px;color:#cbd5e1;line-height:1.6;">${activity.summary}</div>
              </div>
            `,
          )
          .join('')
      : '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(148,163,184,0.24);font-size:12px;color:#94a3b8;">这块暂时还没有新的跟进。</div>';

  return `
    <div style="font-family:system-ui,sans-serif;min-width:260px;max-width:320px;padding:10px 12px;border-radius:18px;background:rgba(2,6,23,0.92);border:1px solid rgba(56,189,248,0.18);box-shadow:0 16px 40px rgba(15,23,42,0.45);">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px;">
        <span style="padding:2px 8px;border-radius:999px;background:${color}22;color:${color};font-size:11px;font-weight:700;">${display.label}</span>
        <span style="font-size:11px;color:#94a3b8;">${marker.scene}</span>
      </div>
      <div style="font-size:13px;line-height:1.6;color:#f8fafc;font-weight:600;margin-bottom:8px;">${marker.title}</div>
      <div style="font-size:12px;line-height:1.7;color:#cbd5e1;">${marker.summary}</div>
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
            color: isActive ? '#f6fffb' : display.color,
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
            color: '#67f7d0',
            colorPair: index === trail.edges.length - 1 ? ['#d7fff5', '#59f3ca'] : ['#9ffaea', '#2ee8bf'],
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
          .atmosphereColor('#21c7a8')
          .atmosphereAltitude(0.16);

        const globeMaterial = globe.globeMaterial() as Material & { color?: Color };
        if ('color' in globeMaterial) {
          globeMaterial.color = new Color('#04121c');
        }

        globe
          .polygonsData(globePolygons.features)
          .polygonCapColor(() => 'rgba(4, 18, 28, 0.05)')
          .polygonSideColor(() => 'rgba(4, 18, 28, 0.03)')
          .polygonStrokeColor(() => 'rgba(41, 214, 181, 0.24)')
          .polygonAltitude(() => 0.005);

        globe.controls().autoRotate = true;
        globe.controls().autoRotateSpeed = 0.28;
        globe.controls().enablePan = false;
        globe.controls().enableDamping = true;
        globe.pointOfView({ lat: 24, lng: 15, altitude: 1.22 }, 0);

        const setSize = () => {
          if (!containerRef.current || !globeRef.current) return;
          const { clientWidth, clientHeight } = containerRef.current;
          globeRef.current.width(clientWidth);
          globeRef.current.height(clientHeight);
        };

        setSize();
        resizeObserver = new ResizeObserver(setSize);
        resizeObserver.observe(container);
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
      resizeObserver?.disconnect();
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
          return `<div style="min-width:220px;max-width:280px;padding:8px 10px;border-radius:12px;background:rgba(4,18,28,0.94);border:1px solid rgba(103,247,208,0.34);box-shadow:0 0 18px rgba(103,247,208,0.18);color:#dffef5;">
            <div style="font-size:11px;color:#86ffd8;font-weight:700;margin-bottom:4px;">${item.label}</div>
            <div style="font-size:12px;line-height:1.6;color:#e6fff7;">${item.reason}</div>
            <div style="margin-top:6px;font-size:11px;color:#9fe7d4;">把握度 ${Math.round(item.confidence * 100)}%</div>
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
      <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_50%_18%,rgba(33,199,168,0.1)_0%,rgba(15,23,42,0)_28%),linear-gradient(180deg,#031018_0%,#07131c_100%)] p-5">
        <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-slate-950/72 px-4 py-3 text-sm text-slate-200 shadow-[0_16px_36px_rgba(2,6,23,0.45)] backdrop-blur">
          当前浏览器不支持 WebGL，已切换为静态地球；落点和列表信息都能继续查看。
        </div>
        <div className="grid h-[calc(100%-5rem)] grid-cols-1 gap-4">
          <div className="relative min-h-[24rem] overflow-hidden rounded-[28px] border border-emerald-400/16 bg-[radial-gradient(circle_at_50%_42%,rgba(18,78,96,0.38)_0%,rgba(3,16,24,0)_58%),linear-gradient(180deg,rgba(2,6,23,0.64),rgba(2,6,23,0.94))] shadow-[inset_0_0_0_1px_rgba(45,212,191,0.08)]">
            <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(148,163,184,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.14)_1px,transparent_1px)] [background-size:48px_48px]" />
            <div className="absolute left-1/2 top-1/2 h-[86%] w-[86%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/30 bg-[radial-gradient(circle_at_45%_35%,rgba(45,212,191,0.18)_0%,rgba(8,47,73,0.22)_32%,rgba(2,6,23,0.96)_74%)] shadow-[0_0_80px_rgba(45,212,191,0.16)]">
              <div className="absolute inset-[7%] rounded-full border border-emerald-200/10" />
              <div className="absolute inset-[18%] rounded-full border border-emerald-200/10" />
              <div className="absolute left-1/2 top-[6%] h-[88%] w-px -translate-x-1/2 bg-emerald-200/12" />
              <div className="absolute left-[28%] top-[10%] h-[80%] w-px -rotate-[12deg] bg-emerald-200/10" />
              <div className="absolute right-[28%] top-[10%] h-[80%] w-px rotate-[12deg] bg-emerald-200/10" />
              <div className="absolute left-[10%] top-1/2 h-px w-[80%] -translate-y-1/2 bg-emerald-200/12" />
              <div className="absolute left-[14%] top-[34%] h-px w-[72%] bg-emerald-200/10" />
              <div className="absolute left-[14%] top-[66%] h-px w-[72%] bg-emerald-200/10" />

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
                        background: isActive ? '#f6fffb' : display.color,
                        borderColor: isActive ? '#d1fae5' : `${display.color}55`,
                        boxShadow: `0 0 16px ${display.glow}`,
                      }}
                    />
                  </button>
                );
              })}
            </div>

            <div className="absolute left-4 top-4 rounded-full border border-emerald-400/20 bg-slate-950/70 px-3 py-2 text-xs text-slate-200 backdrop-blur">
              静态地球视图
            </div>
            <div className="absolute bottom-4 left-4 rounded-full border border-emerald-400/20 bg-slate-950/70 px-3 py-2 text-xs text-slate-200 backdrop-blur">
              可见落点 {fallbackProjectedMarkers.length} / {globeMarkers.length}
            </div>
          </div>

          <div className="hidden space-y-3 overflow-auto pr-1">
            {globeMarkers.slice(0, 10).map((marker) => (
              <button
                key={marker.id}
                type="button"
                onClick={() => onSelectMarker?.(marker.id)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  activeMarkerId === marker.id
                    ? 'border-emerald-300 bg-emerald-50/10 shadow-[0_14px_28px_rgba(52,211,153,0.14)]'
                    : 'border-slate-700/70 bg-slate-950/55 hover:border-emerald-400/40'
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
                  <span className="text-[11px] text-slate-400">{marker.scene}</span>
                </div>
                <p className="text-sm font-semibold text-white">{marker.title}</p>
                <p className="mt-2 line-clamp-3 text-xs leading-6 text-slate-300">{marker.summary}</p>
                <div className="mt-3 text-[11px] text-slate-400">
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
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_50%_18%,rgba(33,199,168,0.1)_0%,rgba(15,23,42,0)_28%),linear-gradient(180deg,#031018_0%,#07131c_100%)]">
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(33,199,168,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(33,199,168,0.08)_1px,transparent_1px)] [background-size:40px_40px]" />
      <div ref={containerRef} className="relative h-full w-full" />

      {!globeReady ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[radial-gradient(circle_at_50%_42%,rgba(18,78,96,0.42)_0%,rgba(3,16,24,0.2)_54%,rgba(2,6,23,0.05)_100%)]">
          <div className="relative aspect-square w-[72%] max-w-[34rem] rounded-full border border-emerald-300/24 bg-[radial-gradient(circle_at_44%_34%,rgba(45,212,191,0.2)_0%,rgba(8,47,73,0.24)_34%,rgba(2,6,23,0.94)_74%)] shadow-[0_0_80px_rgba(45,212,191,0.18)]">
            <div className="absolute inset-[8%] rounded-full border border-emerald-200/10" />
            <div className="absolute inset-[20%] rounded-full border border-emerald-200/10" />
            <div className="absolute left-1/2 top-[7%] h-[86%] w-px -translate-x-1/2 bg-emerald-200/12" />
            <div className="absolute left-[11%] top-1/2 h-px w-[78%] -translate-y-1/2 bg-emerald-200/12" />
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
          <div className="absolute bottom-4 left-4 rounded-full border border-emerald-400/20 bg-slate-950/72 px-3.5 py-2 text-xs text-slate-200 shadow-[0_16px_36px_rgba(2,6,23,0.45)] backdrop-blur">
            地图加载中 · 信号 {markers.length}
          </div>
        </div>
      ) : null}

      <div className="absolute left-4 top-4 z-10 rounded-full border border-emerald-400/20 bg-slate-950/72 px-4 py-2.5 shadow-[0_16px_36px_rgba(2,6,23,0.45)] backdrop-blur">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-200">
          {[
            { key: 'high', label: '高热点', color: '#ff5c73' },
            { key: 'elevated', label: '升温', color: '#28d7ff' },
            { key: 'monitoring', label: '监测', color: '#86ffd8' },
          ].map((item) => (
            <div key={item.key} className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full shadow-[0_0_14px_currentColor]" style={{ background: item.color, color: item.color }} />
              <span>{item.label}</span>
            </div>
          ))}
          {trails.length > 0 ? (
            <div className="flex items-center gap-2 text-emerald-200">
              <div className="h-[2px] w-5 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.8)]" />
              <span>事件脉络</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="absolute bottom-4 left-4 z-10 rounded-full border border-emerald-400/20 bg-slate-950/72 px-3.5 py-2 text-xs text-slate-200 shadow-[0_16px_36px_rgba(2,6,23,0.45)] backdrop-blur">
        信号 <span className="font-semibold text-white">{markers.length}</span>
      </div>
    </div>
  );
}
