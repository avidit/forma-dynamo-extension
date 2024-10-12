export class FetchError extends Error {
  status: number;
  constructor(m: string, status: number) {
    super(m);

    this.status = status;
  }
}

export type DaasState =
  | {
      status: "online";
      serverInfo: ServerInfo;
    }
  | {
      status: "error";
      error: string;
    }
  | {
      status: "offline";
    };

export interface DynamoService {
  run: (target: GraphTarget, inputs: RunInputs) => Promise<Run>;
  folder: (path: string) => Promise<FolderGraphInfo[]>;
  info: (target: GraphTarget) => Promise<GraphInfo>;
  trust: (path: string) => Promise<boolean>;
  serverInfo: () => Promise<ServerInfo>;
  //health: (port: number) => Promise<Health>;
}

export type GraphTarget =
  | {
      type: "PathGraphTarget";
      path: string;
      forceReopen?: boolean;
    }
  | {
      type: "CurrentGraphTarget";
    }
  | {
      type: "JsonGraphTarget";
      graph?: unknown;
      contents?: string;
    };

export type Input = {
  id: string;
  name: string;
  type: string;
  value: string;
  nodeTypeProperties: {
    options: string[];
    minimumValue: number;
    maximumValue: number;
    stepValue: number;
  };
};

export type Output = {
  id: string;
  name: string;
  type: string;
  value: string | number;
  valueString?: {
    count: number;
    value: string | number;
  };
};

export type Metadata = {
  author: string;
  customProperties: unknown;
  description: string;
  dynamoVersion: string;
  thumbnail: string;
};

export type Issue = {
  message: string;
  nodeId: string;
  nodeName: string;
  type: string;
};

export type Run = {
  info: {
    id: string;
    issues: Issue[];
    name: string;
    outputs: Output[];
    status: string;
  };
  title?: string;
};

export type FolderGraphInfo = {
  type: "FolderGraph";
  id: string;
  metadata: Metadata;
  name: string;
};

export type GraphInfo = {
  dependencies: Array<{ name: string; version: string; type: string; state: string }>;
  id: string;
  inputs: Array<Input>;
  issues: Array<unknown>;
  metadata: Metadata;
  name: string;
  outputs: Output[];
  status: string;
};

type Health = {
  status: number;
  port: number;
};

export type RunInputs = { nodeId: string; value: any }[];

export type ServerInfo = {
  apiVersion: string;
  dynamoVersion: string;
  playerVersion: string;
};

const runSync = new URLSearchParams(window.location.search).get("ext:daas") === "sync";

class Dynamo implements DynamoService {
  private url: string;
  private authProvider?: () => Promise<string>;

  constructor(url: string, authProvider?: () => Promise<string>) {
    this.url = url;
    this.authProvider = authProvider;
  }

  async _fetch(input: RequestInfo, init?: RequestInit | undefined): Promise<Response> {
    if (this.authProvider && init) {
      const headers = new Headers(init.headers);
      if (!headers.has("Authorization")) {
        const authzString = await this.authProvider();
        headers.set("Authorization", authzString);
        init.headers = headers;
      }
    }

    return fetch(input, init);
  }

  async runAsync(target: GraphTarget, inputs: RunInputs): Promise<Run> {
    const createJob = await this._fetch(`${this.url}/v1/graph/job/create`, { method: "GET" });

    if (createJob.status !== 200) {
      throw new FetchError(createJob.statusText, createJob.status);
    }

    const { jobId, uploadUrl } = await createJob.json();

    await fetch(uploadUrl, {
      method: "PUT",
      body: JSON.stringify({
        target,
        ignoreInputs: false,
        getImage: false,
        getGeometry: false,
        getContents: false,
        inputs,
      }),
    });

    const response = await this._fetch(`${this.url}/v1/graph/job/${jobId}/run?passtoken=1`, {
      method: "POST",
    });

    if (response.status !== 200) {
      throw new FetchError(response.statusText, response.status);
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // const jobResponse = await this._fetch(`${this.url}/v1/graph/results/${jobId}`, {
      //   method: "GET",
      // });
      const job = {
        status: "COMPLETE",
        result: {
          info: {
            issues: [
              {
                nodeId: "3071764a-815e-4e04-8b4d-2ce9e8ae81d1",
                nodeName: "Integrate.ByRepresentations",
                type: "WARNING",
                message:
                  "Integrate.ByRepresentations operation failed. \r\nObject reference not set to an instance of an object.",
              },
              {
                nodeId: "d9e5d783-b951-42e8-9bac-9d6c12aed9d1",
                nodeName: "TerrainShape.ByCurve",
                type: "WARNING",
                message:
                  "TerrainShape.ByCurve operation failed. \r\nUnable to cast object of type 'System.String' to type 'System.Byte[]'.",
              },
            ],
            status: "WARNINGS",
            outputs: [
              {
                id: "eecab10a-c774-4ee3-ae63-3ee6121e7fc4",
                name: "SendElementsToForma",
                value: [
                  '[{"urn":"urn:adsk-forma-elements:integrate:pro_brv2lm8dmg:0a8429ef-2a63-41f8-bb52-89d9f46d6505:1728643644867","transform":[1.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0]}]',
                  null,
                ],
                valueString: {
                  count: 0,
                  value: "List",
                  items: {
                    0: {
                      path: ["0"],
                      count: 0,
                      value:
                        '[{"urn":"urn:adsk-forma-elements:integrate:pro_brv2lm8dmg:0a8429ef-2a63-41f8-bb52-89d9f46d6505:1728643644867","transform":[1.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0]}]',
                    },
                    "1": {
                      path: ["1"],
                      count: 0,
                    },
                  },
                },
                type: "SendElementsToForma",
              },
            ],
            id: "",
            name: "",
          },
        },
      };

      if (job.status === "SUCCESS" || job.status === "COMPLETE") {
        return job.result as any;
      } else if (job.status === "FAILED") {
        throw new FetchError("Job failed", 500);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  async run(target: GraphTarget, inputs: RunInputs): Promise<Run> {
    if (!runSync && !this.url.startsWith("http://localhost")) {
      return this.runAsync(target, inputs);
    }

    const response = await this._fetch(`${this.url}/v1/graph/run`, {
      method: "POST",
      body: JSON.stringify({
        target,
        ignoreInputs: false,
        getImage: false,
        getGeometry: false,
        getContents: false,
        inputs,
      }),
    });

    return await response.json();
  }

  async folder(path: string): Promise<FolderGraphInfo[]> {
    return this._fetch(`${this.url}/v1/graph-folder/info`, {
      method: "POST",
      body: JSON.stringify({
        path: path.replaceAll(/\\/g, "\\\\"),
      }),
    }).then((res) => res.json());
  }

  async info(target: GraphTarget): Promise<GraphInfo> {
    const response = await this._fetch(`${this.url}/v1/graph/info`, {
      method: "POST",
      body: JSON.stringify({
        target,
        data: {
          metadata: true,
          issues: true,
          status: true,
          inputs: true,
          outputs: true,
          dependencies: true,
        },
      }),
    });

    if (response.status === 200) {
      return await response.json();
    }
    const body = await response.json();

    throw new FetchError(body?.title || response.statusText, response.status);
  }

  async trust(path: string): Promise<boolean> {
    const response = await this._fetch(`${this.url}/v1/settings/trusted-folder`, {
      method: "POST",
      body: JSON.stringify({
        path,
      }),
    });
    return await response.json();
  }

  async serverInfo(): Promise<ServerInfo> {
    const response = await this._fetch(`${this.url}/v1/server-info`);
    return await response.json();
  }

  static async health(port: number): Promise<Health> {
    // const response = await fetch(`http://localhost:${port}/v1/health`);
    // if (response.status === 200) {
    //   return { status: 200, port };
    // }

    // throw new FetchError(response.statusText, response.status);
    throw new Error("Kjeks");
  }
}

export default Dynamo;
