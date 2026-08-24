import type { DetailedHTMLProps, HTMLAttributes } from "react";

type AltchaWidgetProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  challenge?: string;
  challengeurl?: string;
  auto?: string;
  name?: string;
  ref?: any;
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "altcha-widget": AltchaWidgetProps;
    }
  }
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "altcha-widget": AltchaWidgetProps;
    }
  }
}
