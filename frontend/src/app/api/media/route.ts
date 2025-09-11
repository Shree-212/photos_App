import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Get the authorization header
    const authorization = request.headers.get('authorization');
    
    if (!authorization) {
      return NextResponse.json({ error: 'Authorization header required' }, { status: 401 });
    }

    // Construct media service URL for listing
    const mediaServiceUrl = 'http://media-service.task-manager.svc.cluster.local:80/media';
    
    // Add query parameters if any
    const url = new URL(request.url);
    const searchParams = url.searchParams.toString();
    const finalUrl = searchParams ? `${mediaServiceUrl}?${searchParams}` : mediaServiceUrl;
    
    console.log('Fetching media list from:', finalUrl);
    
    // Create a timeout controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes
    
    try {
      const response = await fetch(finalUrl, {
        method: 'GET',
        headers: {
          'Authorization': authorization,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Media service error:', response.status, errorData);
        return new NextResponse(errorData, { status: response.status });
      }

      // For JSON responses (media listing)
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
      
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Request timeout' }, 
          { status: 408 }
        );
      }
      
      throw fetchError;
    }
    
  } catch (error: any) {
    console.error('Media proxy error:', error);
    
    return NextResponse.json(
      { error: 'Media service error', details: error.message }, 
      { status: 500 }
    );
  }
}
