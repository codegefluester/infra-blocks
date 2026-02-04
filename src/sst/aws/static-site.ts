// src/static-site.ts

// Type definitions for SST v3 components we use
// In SST projects, these are available via the global sst namespace
declare namespace sst {
  namespace aws {
    interface StaticSiteArgs {
      path?: string;
      build?: {
        command?: string;
        output?: string;
      };
      domain?: {
        name: string;
        dns: any;
      };
      environment?: Record<string, string>;
      errorPage?: string;
      [key: string]: any;
    }

    class StaticSite {
      constructor(name: string, args: StaticSiteArgs);
    }

    function dns(args: { zone: string }): any;
  }
}

export interface StaticSiteProps {
  /**
   * Domain configuration
   */
  domain: {
    name: string; // e.g., "myapp.example.com"
    zone: string; // e.g., "example.com" (your Route53 hosted zone)
  };

  /**
   * Path to your site code
   * @default "."
   */
  path?: string;

  /**
   * Build command
   * @default "pnpm build"
   */
  buildCommand?: string;

  /**
   * Build output directory
   * @default "dist"
   */
  buildOutput?: string;

  /**
   * Environment variables available during build
   */
  environment?: Record<string, string>;

  /**
   * Override any sst.aws.StaticSite props
   */
  sst?: Partial<sst.aws.StaticSiteArgs>;

  /**
   * The command to run to spin up a development instance
   */
  devCommand?: string;

  /**
   * The URL of the local development server
   */
  devUrl?: string;
}

export function StaticSite(
  name: string,
  props: StaticSiteProps,
): sst.aws.StaticSite {
  return new sst.aws.StaticSite(name, {
    // Defaults optimized for React + Vite
    path: props.path ?? ".",
    build: {
      command: props.buildCommand ?? "pnpm build",
      output: props.buildOutput ?? "dist",
    },

    dev: {
      autostart: true,
      command: props.devCommand ?? "pnpm run dev",
      title: "Static Website",
      url: props.devUrl ?? "http://localhost:5137",
    },

    // SSL + DNS automatic via domain config
    domain: {
      name: props.domain.name,
      dns: sst.aws.dns({
        zone: props.domain.zone,
      }),
    },

    // Pass environment variables only if defined
    ...(props.environment && { environment: props.environment }),

    // Opinionated defaults for SPA routing
    errorPage: "index.html",

    // Allow full override of any StaticSite property
    ...props.sst,
  });
}
