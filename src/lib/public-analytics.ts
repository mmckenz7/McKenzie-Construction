type AnalyticsWindow = Window & {
  dataLayer?: unknown[][];
  gtag?: (...args: unknown[]) => void;
};

export function recordPublicConversion(
  eventName: string,
  eventLabel: string,
) {
  const analyticsWindow = window as AnalyticsWindow;
  const parameters = {
    event_category: "lead_generation",
    event_label: eventLabel,
  };

  if (analyticsWindow.gtag) {
    analyticsWindow.gtag("event", eventName, parameters);
    return;
  }

  analyticsWindow.dataLayer ??= [];
  analyticsWindow.dataLayer.push(["event", eventName, parameters]);
}
