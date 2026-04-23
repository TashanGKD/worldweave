import { NextRequest, NextResponse } from 'next/server';
import { FetchClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export async function GET(request: NextRequest) {
  try {
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new FetchClient(config, customHeaders);

    // 爬取 world-monitor.com
    const response = await client.fetch('https://world-monitor.com/');

    if (response.status_code !== 0) {
      return NextResponse.json(
        { error: 'Failed to fetch data', message: response.status_message },
        { status: 500 }
      );
    }

    // 返回完整响应供分析
    return NextResponse.json({
      success: true,
      title: response.title,
      url: response.url,
      publishTime: response.publish_time,
      filetype: response.filetype,
      contentTypes: response.content.map(c => c.type),
      textPreview: response.content
        .filter(item => item.type === 'text')
        .map(item => item.text?.substring(0, 500))
        .join('\n---\n'),
      fullContent: response.content,
    });
  } catch (error) {
    console.error('Scrape error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
